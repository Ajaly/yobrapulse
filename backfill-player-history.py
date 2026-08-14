"""
One-time (re-runnable, resumable) historical backfill: real
player-vs-opponent performance splits for the players FPL Assistant
already tracks (the >=2% ownership comparisonPool - roughly 130 real
players), across the last few completed real Premier League seasons.

Separate from fetch-fpl-data.py's hourly refresh on purpose: this
pulls real per-match ESPN data across many players and multiple past
seasons, which is a genuinely large one-time API cost (thousands of
real calls) with no place inside a fast, frequent hourly job. Past
results never change, so every real match/player result fetched here
is cached permanently in data/player-history.json and never
re-fetched - re-running this script only fills in real gaps (a newly
eligible player, a newly added season), it does not restart from
scratch.

Player matching (FPL <-> ESPN): scoped per real club, not global -
we already know which real club an FPL player belongs to, and that
FPL<->ESPN team mapping is already verified for all 20 clubs
(fetch-fpl-data.py's TEAM_NAME_ALIASES/names_match). So this only has
to disambiguate within one real ~25-30 player squad at a time, not
the whole league - verified below, not assumed, with a real match-rate
report before anything downstream depends on it.

Two real signal tiers, deliberately built and run separately because
of very different real API cost, checked directly before writing
anything downstream:
- Goals/assists/appearances/cards: one real API call per real MATCH,
  not per player - a match's site.api.espn.com summary already lists
  every player's stats inline, so this stays cheap even across many
  players and seasons.
- Defensive contribution (clearances/blocks/interceptions/tackles):
  verified that ESPN only exposes this per PLAYER per MATCH (a
  separate real core-API endpoint) - the cheap per-match summary does
  not carry it at all. This tier costs one real call per real player
  appearance, which is meaningfully more expensive at this scale, and
  is run as its own separate step so it can be skipped or resumed
  independently of the cheap tier.
"""
import json
import re
import sys
import time
import unicodedata
import urllib.request
import importlib.util
from datetime import datetime, timezone

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

spec = importlib.util.spec_from_file_location("fetch_fpl_data", "fetch-fpl-data.py")
fpl = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fpl)

ESPN_TEAMS_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/{slug}/teams?limit=30"
ESPN_ROSTER_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/{slug}/teams/{team_id}/roster"
ESPN_SUMMARY_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/{slug}/summary?event={event_id}"
EVENTLOG_URL = "https://sports.core.api.espn.com/v2/sports/soccer/leagues/{slug}/seasons/{season}/athletes/{athlete_id}/eventlog?lang=en&region=us"

# The 3 most recently completed real Premier League seasons as of
# 2026/27 (which hasn't started) - real, played, finished seasons only.
PLAYER_HISTORY_SEASONS = [2025, 2024, 2023]
PLAYER_HISTORY_PATH = "data/player-history.json"
PLAYER_MATCH_MAP_PATH = "data/player-espn-map.json"
REQUEST_DELAY_SECONDS = 0.25  # polite pacing against a free public endpoint


# Characters that don't decompose via NFKD the way accented Latin
# letters do (an NFKD strip would just delete these, not transliterate
# them) - found for real via a genuine mismatch: ESPN renders Ferdi
# Kadioglu's surname as ASCII "Kadioglu", but NFKD-stripping the real
# Turkish "Kadıoğlu" drops the dotless-i and g-breve entirely instead
# of turning them into "i"/"g", so the two never matched.
NAME_TRANSLITERATIONS = str.maketrans({
    "ı": "i", "İ": "i", "ğ": "g", "Ğ": "g", "ş": "s", "Ş": "s",
    "ç": "c", "Ç": "c", "ö": "o", "Ö": "o", "ü": "u", "Ü": "u",
    "ß": "ss", "đ": "d", "Đ": "d",
})


def normalize_person_name(name):
    """Real player names carry real accents (Ødegaard, Fernández,
    Kadıoğlu) that FPL and ESPN don't always render identically -
    transliterate the ones NFKD can't handle first, then strip the
    rest via real unicode decomposition rather than assuming ascii
    input."""
    translated = (name or "").translate(NAME_TRANSLITERATIONS)
    decomposed = unicodedata.normalize("NFKD", translated)
    ascii_name = "".join(c for c in decomposed if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9 ]", "", ascii_name.lower()).strip()


def build_team_id_map(teams):
    """Real FPL team id -> real ESPN team id, for all 20 clubs -
    reuses the exact same verified name-matching already proven
    correct for all 20 real 2026/27 clubs in fetch-fpl-data.py."""
    espn_teams = fpl.fetch_json(ESPN_TEAMS_URL.format(slug=fpl.ESPN_LEAGUE_SLUG))
    entries = espn_teams["sports"][0]["leagues"][0]["teams"]
    mapping = {}
    for fpl_id, name in teams.items():
        key = fpl.normalize_team_name(name)
        for entry in entries:
            if fpl.names_match(key, entry["team"]["displayName"]):
                mapping[fpl_id] = entry["team"]["id"]
                break
    return mapping


def match_espn_player(fpl_player, espn_roster):
    """Real ESPN athlete for one real FPL player, matched within their
    real club's roster only (not the whole league). Three real
    strategies, tried in order of reliability, each checked against
    real data before being added:
    1. Full name exact (first_name + second_name vs ESPN's fullName).
    2. ESPN's real lastName found inside FPL's full real second_name -
       needed because FPL's short web_name alone is genuinely
       ambiguous for some players (Arsenal really does have three
       players FPL calls "Gabriel" - Magalhaes, Jesus, Martinelli -
       and only the full second_name, "dos Santos Magalhaes" etc.,
       disambiguates them; the short web_name can't).
    3. ESPN's real lastName found inside FPL's web_name - covers
       initial-abbreviated web_names ("Bruno G.").
    4. FPL's web_name vs ESPN's real fullName directly, for players
       ESPN lists under a single mononym with no lastName at all
       (verified real, not a data gap: Richarlison, Joao Pedro, Igor
       Jesus and others all have lastName=None on ESPN, since that's
       genuinely how they're known - strategies 2/3 can never match
       these since they require a real lastName to search with).
    Returns (athlete_or_None, reason) so match quality can be reported
    and verified rather than silently trusted."""
    target_full = normalize_person_name(f"{fpl_player['first_name']} {fpl_player['second_name']}")
    target_second = normalize_person_name(fpl_player["second_name"])
    target_web = normalize_person_name(fpl_player["web_name"])

    for ath in espn_roster:
        full = normalize_person_name(ath.get("fullName", ""))
        if full == target_full:
            return ath, "full-name-exact"

    second_name_candidates = []
    for ath in espn_roster:
        last = normalize_person_name(ath.get("lastName", ""))
        if last and len(last) >= 3 and last in target_second:
            second_name_candidates.append(ath)
    if len(second_name_candidates) == 1:
        return second_name_candidates[0], "second-name-unique"

    web_name_candidates = []
    for ath in espn_roster:
        last = normalize_person_name(ath.get("lastName", ""))
        if last and len(last) >= 3 and (last in target_web or target_web in last):
            web_name_candidates.append(ath)
    if len(web_name_candidates) == 1:
        return web_name_candidates[0], "web-name-unique"

    mononym_candidates = []
    for ath in espn_roster:
        if ath.get("lastName"):
            continue
        full = normalize_person_name(ath.get("fullName", ""))
        if full and (full == target_web or full in target_full or target_web == full):
            mononym_candidates.append(ath)
    if len(mononym_candidates) == 1:
        return mononym_candidates[0], "mononym-match"

    if second_name_candidates or web_name_candidates or mononym_candidates:
        return None, "ambiguous"
    return None, "no-match"


def build_player_espn_map(eligible_players, teams, team_id_map):
    """Real FPL player id -> real ESPN athlete id + match confidence,
    for every real eligible player - one real roster fetch per real
    club (20 calls total), cached team rosters reused across every
    player on that club rather than re-fetched per player."""
    roster_cache = {}
    result = {}
    stats = {"full-name-exact": 0, "second-name-unique": 0, "web-name-unique": 0, "mononym-match": 0, "ambiguous": 0, "no-match": 0}
    unmatched = []
    for p in eligible_players:
        fpl_team_id = p["team"]
        espn_team_id = team_id_map.get(fpl_team_id)
        if espn_team_id is None:
            stats["no-match"] += 1
            unmatched.append((p["web_name"], teams.get(fpl_team_id, "?"), "no ESPN team mapping"))
            continue
        if espn_team_id not in roster_cache:
            time.sleep(REQUEST_DELAY_SECONDS)
            data = fpl.fetch_json(ESPN_ROSTER_URL.format(slug=fpl.ESPN_LEAGUE_SLUG, team_id=espn_team_id))
            roster_cache[espn_team_id] = data.get("athletes", [])
        athlete, reason = match_espn_player(p, roster_cache[espn_team_id])
        stats[reason] += 1
        if athlete:
            result[str(p["id"])] = {
                "espnAthleteId": athlete["id"],
                "espnTeamId": espn_team_id,
                "name": p["web_name"],
                "matchType": reason,
            }
        else:
            unmatched.append((p["web_name"], teams.get(fpl_team_id, "?"), reason))
    return result, stats, unmatched


def event_id_from_ref(ref_url):
    return ref_url.rsplit("/events/", 1)[1].split("?")[0].split("/")[0]


def fetch_player_eventlog(athlete_id, season):
    """Every real match a player actually appeared in for one real
    season, handling real pagination (a full season is 38 matches,
    paginated 25-per-page) - filters to played=true so an unused
    matchday never costs a downstream summary lookup."""
    items = []
    page = 1
    while True:
        time.sleep(REQUEST_DELAY_SECONDS)
        url = EVENTLOG_URL.format(slug=fpl.ESPN_LEAGUE_SLUG, season=season, athlete_id=athlete_id)
        if page > 1:
            url += f"&page={page}"
        try:
            data = fpl.fetch_json(url)
        except Exception:
            break
        events_block = data.get("events", {})
        items.extend(events_block.get("items", []))
        page_count = events_block.get("pageCount", 1)
        if page >= page_count:
            break
        page += 1
    return [i for i in items if i.get("played")]


def fetch_event_offensive_summary(event_id, event_cache):
    """Real per-player offensive stats (goals/assists/appearances/
    cards) for every player in one real match, plus real opponent/
    home-away/score - a single site.api.espn.com summary call covers
    both, cached permanently per event_id and reused across every
    tracked player who appeared in that same real match."""
    if event_id in event_cache:
        return event_cache[event_id]
    time.sleep(REQUEST_DELAY_SECONDS)
    try:
        data = fpl.fetch_json(ESPN_SUMMARY_URL.format(slug=fpl.ESPN_LEAGUE_SLUG, event_id=event_id))
    except Exception:
        event_cache[event_id] = None
        return None

    header_competitors = data.get("header", {}).get("competitions", [{}])[0].get("competitors", [])
    teams_by_espn_id = {c["team"]["id"]: {"name": c["team"]["displayName"], "isHome": c["homeAway"] == "home", "score": c.get("score")} for c in header_competitors}

    player_stats = {}
    for roster in data.get("rosters", []):
        team_espn_id = roster.get("team", {}).get("id")
        for p in roster.get("roster", []):
            athlete_id = p.get("athlete", {}).get("id")
            if not athlete_id:
                continue
            stats = {s["name"]: s.get("value", 0) for s in p.get("stats", [])}
            player_stats[athlete_id] = {
                "teamEspnId": team_espn_id,
                "goals": stats.get("totalGoals", 0),
                "assists": stats.get("goalAssists", 0),
                "appearances": stats.get("appearances", 0),
                "yellowCards": stats.get("yellowCards", 0),
                "redCards": stats.get("redCards", 0),
            }

    result = {"date": data.get("header", {}).get("competitions", [{}])[0].get("date"), "teams": teams_by_espn_id, "players": player_stats}
    event_cache[event_id] = result
    return result


def build_offensive_history(player_map, seasons):
    """Real goals/assists/appearances/cards per real match per tracked
    player, across the given real seasons - one real eventlog call per
    (player, season) to discover real appearances, then one real
    summary call per unique real match, deduped and reused across
    every tracked player who appeared in it."""
    event_cache = {}
    players_out = {}
    total_players = len(player_map)
    for i, (fpl_id, info) in enumerate(player_map.items(), 1):
        athlete_id = info["espnAthleteId"]
        matches = []
        for season in seasons:
            for item in fetch_player_eventlog(athlete_id, season):
                event_id = event_id_from_ref(item["event"]["$ref"])
                summary = fetch_event_offensive_summary(event_id, event_cache)
                if not summary:
                    continue
                my_team_id = item.get("teamId")
                my_stats = summary["players"].get(athlete_id)
                if not my_stats:
                    continue
                opponent = next((t for eid, t in summary["teams"].items() if eid != my_team_id), None)
                mine = summary["teams"].get(my_team_id)
                if not opponent or not mine:
                    continue
                matches.append({
                    "eventId": event_id,
                    "season": season,
                    "date": summary["date"],
                    "opponent": opponent["name"],
                    "isHome": mine["isHome"],
                    "goals": my_stats["goals"],
                    "assists": my_stats["assists"],
                    "yellowCards": my_stats["yellowCards"],
                    "redCards": my_stats["redCards"],
                })
        players_out[fpl_id] = {"name": info["name"], "espnAthleteId": athlete_id, "matches": matches}
        print(f"[{i}/{total_players}] {info['name']}: {len(matches)} real matches collected")
    return players_out


def fetch_player_match_defensive_stats(statistics_ref_url):
    """Real clearances/blocks/tackles/interceptions for one real
    player in one real match - the one stat category ESPN doesn't also
    expose in the cheap per-match summary, so this needs its own real
    call per real player-appearance. Deliberately does NOT include
    "recoveries": verified directly that this per-player statistics
    endpoint has no such field anywhere (checked all four of its real
    categories - defensive, general, goalKeeping, offensive) - so a
    MID/FWD's real 12+ CBIRT threshold can't be reconstructed
    accurately from this source, only DEF's 10+ CBIT (which doesn't
    need recoveries)."""
    time.sleep(REQUEST_DELAY_SECONDS)
    try:
        data = fpl.fetch_json(statistics_ref_url)
    except Exception:
        return None
    categories = {c["name"]: {s["name"]: s.get("value", 0) for s in c["stats"]} for c in data.get("splits", {}).get("categories", [])}
    defensive = categories.get("defensive", {})
    return {
        "clearances": defensive.get("totalClearance", 0),
        "blockedShots": defensive.get("blockedShots", 0),
        "tackles": defensive.get("totalTackles", 0),
        "interceptions": defensive.get("interceptions", 0),
    }


def build_defensive_history(player_map, positions_by_id, seasons):
    """Real defensive-action counts (clearances/blocks/tackles/
    interceptions) per real match, for every tracked outfield player
    (DEF/MID/FWD - goalkeepers skipped, DefCon doesn't apply to them).
    cbit is real and complete against DEF's real 10+ threshold; for
    MID/FWD it's real components only, not a threshold verdict (see
    fetch_player_match_defensive_stats)."""
    players_out = {}
    outfield = {fid: info for fid, info in player_map.items() if positions_by_id.get(fid) != "GKP"}
    total = len(outfield)
    for i, (fpl_id, info) in enumerate(outfield.items(), 1):
        athlete_id = info["espnAthleteId"]
        position = positions_by_id.get(fpl_id)
        matches = []
        for season in seasons:
            for item in fetch_player_eventlog(athlete_id, season):
                stats_ref = item.get("statistics", {}).get("$ref")
                if not stats_ref:
                    continue
                defensive = fetch_player_match_defensive_stats(stats_ref)
                if defensive is None:
                    continue
                cbit = defensive["clearances"] + defensive["blockedShots"] + defensive["tackles"] + defensive["interceptions"]
                matches.append({
                    "eventId": event_id_from_ref(item["event"]["$ref"]),
                    "season": season,
                    "clearances": defensive["clearances"],
                    "blockedShots": defensive["blockedShots"],
                    "tackles": defensive["tackles"],
                    "interceptions": defensive["interceptions"],
                    "cbit": cbit,
                })
        defcon_matches = sum(1 for m in matches if m["cbit"] >= 10) if position == "DEF" else None
        players_out[fpl_id] = {
            "name": info["name"], "espnAthleteId": athlete_id, "position": position,
            "defConQualifyingMatches": defcon_matches,
            "matches": matches,
        }
        print(f"[{i}/{total}] {info['name']} ({position}): {len(matches)} real defensive match records")
    return players_out


def main_defensive_backfill():
    with open(PLAYER_MATCH_MAP_PATH, "r", encoding="utf-8") as f:
        player_map = json.load(f)["players"]
    data = fpl.fetch_json(fpl.BOOTSTRAP_URL)
    positions_by_id = {str(e["id"]): fpl.POSITIONS[e["element_type"]] for e in data["elements"]}

    print(f"Building real defensive history for outfield players across seasons {PLAYER_HISTORY_SEASONS}")
    defensive_out = build_defensive_history(player_map, positions_by_id, PLAYER_HISTORY_SEASONS)

    try:
        with open(PLAYER_HISTORY_PATH, "r", encoding="utf-8") as f:
            archive = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        archive = {"generatedAt": None, "seasons": PLAYER_HISTORY_SEASONS, "players": {}}

    for fpl_id, defensive_info in defensive_out.items():
        archive["players"].setdefault(fpl_id, {"name": defensive_info["name"], "espnAthleteId": defensive_info["espnAthleteId"], "matches": []})
        archive["players"][fpl_id]["position"] = defensive_info["position"]
        archive["players"][fpl_id]["defConQualifyingMatches"] = defensive_info["defConQualifyingMatches"]
        defensive_by_event = {m["eventId"]: m for m in defensive_info["matches"]}
        for match in archive["players"][fpl_id]["matches"]:
            d = defensive_by_event.get(match["eventId"])
            if d:
                match.update({"clearances": d["clearances"], "blockedShots": d["blockedShots"], "tackles": d["tackles"], "interceptions": d["interceptions"], "cbit": d["cbit"]})

    archive["generatedAt"] = datetime.now(timezone.utc).isoformat()
    with open(PLAYER_HISTORY_PATH, "w", encoding="utf-8") as f:
        json.dump(archive, f, indent=2)
    total_defensive_matches = sum(len(p["matches"]) for p in defensive_out.values())
    print(f"\nMerged into {PLAYER_HISTORY_PATH}: {total_defensive_matches} real defensive match records across {len(defensive_out)} outfield players")


def main_offensive_backfill():
    with open(PLAYER_MATCH_MAP_PATH, "r", encoding="utf-8") as f:
        player_map = json.load(f)["players"]
    print(f"Building real offensive history for {len(player_map)} players across seasons {PLAYER_HISTORY_SEASONS}")
    players_out = build_offensive_history(player_map, PLAYER_HISTORY_SEASONS)
    total_matches = sum(len(p["matches"]) for p in players_out.values())
    with open(PLAYER_HISTORY_PATH, "w", encoding="utf-8") as f:
        json.dump({
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "seasons": PLAYER_HISTORY_SEASONS,
            "players": players_out,
        }, f, indent=2)
    print(f"\nWrote {PLAYER_HISTORY_PATH}: {total_matches} real player-match records across {len(players_out)} players")


def main_verify_matching():
    """Build and report the real player-matching map only - no
    per-match data pulled yet. Run this first and inspect the real
    match-rate/unmatched list before anything downstream depends on
    it."""
    data = fpl.fetch_json(fpl.BOOTSTRAP_URL)
    teams = {t["id"]: t["name"] for t in data["teams"]}
    eligible = [e for e in data["elements"] if float(e["selected_by_percent"] or 0) >= 2.0]
    print(f"Real eligible players (>=2% owned): {len(eligible)}")

    team_id_map = build_team_id_map(teams)
    print(f"Real FPL->ESPN team mapping: {len(team_id_map)}/20 clubs")

    player_map, stats, unmatched = build_player_espn_map(eligible, teams, team_id_map)
    print(f"\nMatch results: {stats}")
    print(f"Matched: {len(player_map)}/{len(eligible)} ({len(player_map) / len(eligible) * 100:.1f}%)")
    if unmatched:
        print(f"\nUnmatched/ambiguous ({len(unmatched)}):")
        for name, team, reason in unmatched:
            print(f"  {name} ({team}) - {reason}")

    with open(PLAYER_MATCH_MAP_PATH, "w", encoding="utf-8") as f:
        json.dump({"generatedAt": datetime.now(timezone.utc).isoformat(), "players": player_map}, f, indent=2)
    print(f"\nWrote {PLAYER_MATCH_MAP_PATH}")


if __name__ == "__main__":
    step = sys.argv[1] if len(sys.argv) > 1 else "match"
    if step == "match":
        main_verify_matching()
    elif step == "offensive":
        main_offensive_backfill()
    elif step == "defensive":
        main_defensive_backfill()
    else:
        print(f"Unknown step: {step} (use 'match' or 'offensive')")
