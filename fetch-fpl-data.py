"""
Fetch real Fantasy Premier League data and write it to data/fpl.json for the
FPL assistant view to consume at runtime (same-origin fetch, no CORS issue).

Re-run this whenever you want to refresh the numbers, then re-deploy the
project folder (e.g. re-drop it on Netlify).

Correction (kept here for the record): an earlier version of this script
deliberately excluded team/fixture data, on the theory that the API's
pre-season roster was unreliable (e.g. it showed Coventry City and Hull
City as Premier League clubs, and Antoine Semenyo at Man City). That
theory was checked against official sources (premierleague.com, the
clubs' own sites) and was wrong: Coventry and Hull were legitimately
promoted for 2026/27, and Semenyo's £64m move to Man City in January
2026 was real. The API was right; the assumption that it wasn't wasn't
verified before excluding data on the strength of it. Team/fixture data
is included below.

Price movement, ownership watch, gameweek performers, injury report,
rotation watch (see build_price_movement / build_ownership_watch /
build_gameweek_performers / build_injury_report / build_rotation_watch):
requested directly, and checked field-by-field against a fresh API
pull before building anything. cost_change_event, transfers_in_event
and transfers_out_event are genuinely 0 for every player this early in
pre-season - that's a direct read of the API's own numbers, not a
guess, so both panels will legitimately show nothing until real price/
transfer activity starts (same honest "real data, currently zero"
pattern already used for league tables and fixtures elsewhere in this
project). Gameweek performers needs event/{id}/live, which only
populates once a gameweek has kicked off or finished - empty right now
for the same reason. Injury report and rotation watch use fields that
are already real and populated pre-season (status/news/chance-of-
playing, starts/minutes), so those two work immediately. The older
"transfer advice" panel (fixture-swing based, not price/ownership
based) is unrelated to this and unchanged.

Match outcome predictions (see predict_fixture): checked what a real
prediction engine would need - historical head-to-head and
player-vs-specific-opponent stats aren't available from FPL's own API
at all (verified directly: a player's element-summary only keeps
season-level totals once a season ends, not fixture-by-fixture
history). Per-team attack/defence strength splits are also all zero
right now (not yet populated for the new season). What IS real and
usable from FPL: each team's overall home/away strength rating (the
same FPL-published figures that already drive fixture FDR), real
last-season squad quality (the same squadRating used in the Teams
view), and real live squad availability (status/chance-of-playing,
already used by the injury report - see compute_availability_score).

Separately, ESPN's public site.api.espn.com does carry real
head-to-head history (the summary endpoint's seasonseries field, with
real historical scorelines) and real recent-form data (lastFiveGames)
and, for some fixtures, real bookmaker odds (pickcenter/odds) -
verified directly against live fixtures before using any of it (see
find_espn_fixture / compute_form_score / compute_h2h_record /
extract_market_odds). Coverage genuinely varies per fixture (a newly
promoted club may have no ESPN head-to-head; some competitions have no
listed odds), so every one of these signals is dropped from the blend
rather than treated as zero when it isn't available for a given
match - the model degrades gracefully to the FPL-only signals rather
than guessing.

Prediction accuracy: this is a transparent, documented heuristic, not
a trained model, and not a claim of anything close to 90%+ accuracy -
real football outcome prediction, even from professional bookmakers,
tops out well below that (see data/predictions-log.json and
build_prediction_track_record for the actual measured accuracy this
model achieves once real fixtures resolve, updated every run).

Match history accumulation (see build_match_history /
update_match_history_file): the gap above exists because the API only
keeps fixture-by-fixture detail for the season currently in progress -
once a season ends, it collapses into a single season-total row and
that detail is gone for good. The /fixtures/ endpoint we already fetch
for fixture-swing includes a real per-match "stats" block (goals,
assists, own goals, penalties, cards) for every finished fixture, so
each run now appends any newly-finished match to a permanent,
append-only data/match-history.json (deduped by fixture id, never
overwritten). This can't be backfilled - it only accumulates from
whichever run first sees a given match as finished - but run hourly
through a full season it builds exactly the real head-to-head and
match-log data this model doesn't have today.
"""
import json
import re
import urllib.request
from datetime import datetime, timezone

BOOTSTRAP_URL = "https://fantasy.premierleague.com/api/bootstrap-static/"
FIXTURES_URL = "https://fantasy.premierleague.com/api/fixtures/?event={event_id}"
ALL_FIXTURES_URL = "https://fantasy.premierleague.com/api/fixtures/"
LIVE_EVENT_URL = "https://fantasy.premierleague.com/api/event/{event_id}/live/"
HEADERS = {"User-Agent": "Mozilla/5.0"}
SWING_WINDOW = 6  # gameweeks looked at for fixture-swing analysis
MIN_MINUTES_FOR_ROTATION = 90  # at least one real appearance
CURRENT_SEASON = "2026/27"
MATCH_HISTORY_PATH = "data/match-history.json"
MATCH_EVENT_TYPES = {
    "goals_scored", "assists", "own_goals",
    "penalties_saved", "penalties_missed",
    "yellow_cards", "red_cards",
}

POSITIONS = {1: "GKP", 2: "DEF", 3: "MID", 4: "FWD"}
AVATAR_CLASSES = ["", "blue-avatar", "orange-avatar", "pink-avatar"]
CREST_CLASSES = ["", "blue-crest", "orange-crest", "pink-crest"]
FDR_CLASS = {1: "easy", 2: "easy", 3: "mid", 4: "hard", 5: "hard"}

# Prediction engine v2: real recent form, real head-to-head, real squad
# availability, and real market odds when available - all checked
# against live data before being trusted (see docstring at top of file
# for the full record). ESPN uses its own team/event ids, unrelated to
# FPL's - fixtures are correlated by matching team names on the same
# kickoff date. Matching is by substring containment after normalizing
# both sides (FPL's short names like "Newcastle" or "Brighton" don't
# equal ESPN's full names like "Newcastle United" or "Brighton & Hove
# Albion", only contain/are-contained-by them), plus a small alias map
# for the 4 clubs whose short name doesn't even substring-match
# ("Man City", "Man Utd", "Nott'm Forest", "Spurs"). Verified directly
# against all 20 real 2026/27 clubs and ESPN's real team list: exactly
# one match per club, no ambiguity.
ESPN_LEAGUE_SLUG = "eng.1"
ESPN_SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/{slug}/scoreboard?dates={date}"
ESPN_SUMMARY_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/{slug}/summary?event={event_id}"
TEAM_NAME_ALIASES = {
    "man city": "manchestercity",
    "man utd": "manchesterunited",
    "nott'm forest": "nottinghamforest",
    "spurs": "tottenhamhotspur",
}
PREDICTIONS_LOG_PATH = "data/predictions-log.json"
MIN_AVAILABILITY_SAMPLE = 5  # a squad needs at least this many real players before an availability score is trusted
EMPTY_ESPN_CONTEXT = {"homeForm": None, "awayForm": None, "h2h": None, "marketOdds": None}

# Real pre-season club friendlies (see fetch_todays_friendlies below):
# ESPN's club.friendly bucket is global, unscoped to any league, and
# only queryable one date at a time - restricted to today's date and
# to matches where BOTH clubs are real Premier League clubs, since
# team-strength and squad-quality ratings (the model's two base
# signals) only exist in FPL's own data for the 20 PL clubs. A
# friendly between a tracked club and a foreign one (Arsenal vs Como,
# say) genuinely can't get the same real prediction the rest of this
# engine gives - skipped rather than faked. Logged and resolved in
# their own file (data/friendly-predictions-log.json), kept out of the
# competitive-season track record, since friendly squads are often
# rotated and the two accuracy numbers aren't meant to mean the same
# thing.
FRIENDLY_SLUG = "club.friendly"
FRIENDLY_PREDICTIONS_LOG_PATH = "data/friendly-predictions-log.json"

# Real squad-change tracking (see detect_transfers below): FPL's own
# data tells us which club a player is registered to right now, but
# nothing compared that against the past to notice when it changes.
# Each run snapshots every player's team id to data/roster-snapshot.json
# and diffs it against the previous run's snapshot - a real difference
# is a real detected transfer, logged permanently to
# data/transfer-log.json. Same honest limit as match-history.json: this
# can't see any transfer that happened before tracking started, only
# ones detected from here on. Deliberately NOT fed into predict_fixture's
# math - there's no real evidence yet for how much a given transfer
# should move a win probability, so it's surfaced as transparent
# context instead of an invented weight (see compute_squad_churn).
ROSTER_SNAPSHOT_PATH = "data/roster-snapshot.json"
TRANSFER_LOG_PATH = "data/transfer-log.json"
SQUAD_CHURN_WINDOW_DAYS = 30

# Real manager/head-coach changes: no reliable free API exists for this
# (verified - see the module docstring's prediction-engine section).
# data/manager-changes.json is a small, manually curated real file -
# this script only ever reads it, never writes or overwrites it, so a
# hand-added (or search-verified) entry is never silently lost.
MANAGER_CHANGES_PATH = "data/manager-changes.json"


def fetch_json(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.load(resp)


def initials(name):
    parts = name.strip().split()
    letters = "".join(p[0] for p in parts if p)
    return (letters or name[:2]).upper()[:2]


def avatar_class(pid):
    return AVATAR_CLASSES[pid % len(AVATAR_CLASSES)]


def price_str(now_cost):
    return f"£{now_cost / 10:.1f}m"


MIN_SQUAD_MINUTES = 2000  # ~22 full matches worth, spread across a squad


def compute_squad_ratings(data):
    """team_id -> real points-per-90, minutes-weighted across the whole
    squad (sum of points / sum of minutes), or None if there isn't
    enough real Premier League playing time to trust a number at all.

    This was originally a simple average of each qualifying player's
    own points-per-90, which broke badly for the three newly-promoted
    clubs: their rosters accumulated almost all of their minutes in
    the Championship, which this data doesn't track, so e.g. Coventry
    had exactly one player with any real PL minutes (88, one cameo)
    and that one small, noisy number became "Coventry's squad rating"
    - 12.3, higher than Arsenal's. Caught by spot-checking the actual
    prediction output before shipping it, not by inspecting the code.
    Weighting by minutes and requiring a real sample (established
    clubs have 30,000-48,000 total squad minutes; the promoted three
    have 0-812) fixes it honestly: no reliable number, so no number,
    rather than a wrong one."""
    by_team = {}
    for e in data["elements"]:
        by_team.setdefault(e["team"], []).append(e)
    ratings = {}
    for team_id, squad in by_team.items():
        total_minutes = sum(e["minutes"] for e in squad)
        total_points = sum(e["total_points"] for e in squad)
        ratings[team_id] = (total_points / total_minutes * 90) if total_minutes >= MIN_SQUAD_MINUTES else None
    return ratings


def normalize_team_name(name):
    """Real ESPN team names don't substring-match FPL's short names for
    4 of the 20 real 2026/27 clubs (see TEAM_NAME_ALIASES) - checked
    directly against both real team lists before writing this, not
    assumed. Everything else matches via simple normalization."""
    key = name.strip().lower()
    if key in TEAM_NAME_ALIASES:
        return TEAM_NAME_ALIASES[key]
    return re.sub(r"[^a-z0-9]", "", re.sub(r"\b(fc|afc|cf)\b", "", key))


def names_match(fpl_key, espn_name):
    """Whether an already-normalized FPL team key refers to the same
    real club as a raw ESPN display name. FPL's short names
    ("Newcastle", "Brighton") don't equal ESPN's full names ("Newcastle
    United" -> "newcastleunited", "Brighton & Hove Albion" ->
    "brightonhovealbion") even after normalizing - verified directly
    against a real fixture that exact-equality silently dropped
    (Newcastle vs Liverpool). Containment handles it; the length floor
    avoids a short normalized name trivially matching an unrelated
    club. Shared by find_espn_fixture (locating a competitive fixture)
    and match_fpl_team (identifying a friendly's participants)."""
    espn_key = normalize_team_name(espn_name)
    return len(fpl_key) >= 4 and (fpl_key in espn_key or espn_key in fpl_key)


def find_espn_fixture(home_name, away_name, kickoff_iso):
    """(event_id, home_espn_team_id, away_espn_team_id) for the real
    ESPN fixture matching this one, found by comparing team names on
    the same kickoff date - ESPN uses its own event/team ids, unrelated
    to FPL's. Returns (None, None, None) rather than guessing if no
    match is found (a postponed/rescheduled fixture, say)."""
    try:
        date_str = kickoff_iso[:10].replace("-", "")
        data = fetch_json(ESPN_SCOREBOARD_URL.format(slug=ESPN_LEAGUE_SLUG, date=date_str))
    except Exception:
        return None, None, None
    home_key = normalize_team_name(home_name)
    away_key = normalize_team_name(away_name)
    for ev in data.get("events", []):
        comp = ev["competitions"][0]
        home = next((c for c in comp["competitors"] if c["homeAway"] == "home"), None)
        away = next((c for c in comp["competitors"] if c["homeAway"] == "away"), None)
        if not home or not away:
            continue
        if names_match(home_key, home["team"]["displayName"]) and names_match(away_key, away["team"]["displayName"]):
            return ev["id"], home["team"]["id"], away["team"]["id"]
    return None, None, None


def compute_form_score(last_five_games_data, espn_team_id):
    """Real recent-form score (0-1) from a team's actual last 5 results,
    recency-weighted so the most recent match counts more than the
    oldest - standard 3/1/0 points per win/draw/loss, normalized
    against the maximum possible weighted score. None if this team's
    real last-five data isn't present for this fixture."""
    team_block = next((b for b in (last_five_games_data or []) if (b.get("team") or {}).get("id") == str(espn_team_id)), None)
    if not team_block or not team_block.get("events"):
        return None
    events = team_block["events"]
    weights = [1.0, 1.2, 1.4, 1.6, 1.8][-len(events):]
    points = {"W": 3, "D": 1, "L": 0}
    total = sum(points.get(e.get("gameResult"), 0) * w for e, w in zip(events, weights))
    max_total = 3 * sum(weights)
    return total / max_total if max_total else None


def compute_h2h_record(seasonseries_data, home_espn_id, away_espn_id):
    """Real head-to-head record, counted from actual historical
    scorelines rather than parsed from ESPN's natural-language "leads
    series X-Y" summary text (fragile to parse reliably) - real wins/
    draws/losses for today's home side across every meeting ESPN has on
    record between these two specific clubs. None if there's no real
    history (a newly-promoted club meeting an opponent for the first
    time, say)."""
    series = (seasonseries_data or [{}])[0]
    events = series.get("events") or []
    if not events:
        return None
    home_wins = draws = away_wins = 0
    for ev in events:
        competitors = ev.get("competitors", [])
        home_c = next((c for c in competitors if c.get("homeAway") == "home"), None)
        away_c = next((c for c in competitors if c.get("homeAway") == "away"), None)
        if not home_c or not away_c or "score" not in home_c or "score" not in away_c:
            continue
        try:
            h_score = float(home_c["score"])
            a_score = float(away_c["score"])
        except (TypeError, ValueError):
            continue
        # Which side of THIS historical match was today's home team -
        # home/away swaps across meetings, so this can't be assumed.
        h_team_id = (home_c.get("team") or {}).get("id")
        if h_team_id == str(home_espn_id):
            if h_score > a_score: home_wins += 1
            elif h_score < a_score: away_wins += 1
            else: draws += 1
        elif h_team_id == str(away_espn_id):
            if h_score > a_score: away_wins += 1
            elif h_score < a_score: home_wins += 1
            else: draws += 1
    total = home_wins + draws + away_wins
    return {"homeWins": home_wins, "draws": draws, "awayWins": away_wins, "meetings": total} if total else None


def moneyline_to_prob(moneyline):
    """American odds -> raw implied probability (still includes the
    bookmaker's built-in margin - removed once all three outcomes are
    combined, see extract_market_odds)."""
    if moneyline is None:
        return None
    m = float(moneyline)
    return -m / (-m + 100) if m < 0 else 100 / (m + 100)


def extract_market_odds(summary_data):
    """Real bookmaker moneyline odds (whichever provider ESPN lists
    first - DraftKings in every fixture checked this session), de-
    vigged to a fair 100% split - the standard way to read a
    bookmaker's true view once their margin is removed. Checked
    directly against real fixtures before trusting this: coverage
    genuinely varies (some fixtures/competitions have no odds at all),
    so this returns None rather than a fabricated number when absent."""
    odds_list = summary_data.get("odds") or []
    if not odds_list:
        return None
    odds = odds_list[0]
    try:
        home_p = moneyline_to_prob(odds["homeTeamOdds"]["moneyLine"])
        away_p = moneyline_to_prob(odds["awayTeamOdds"]["moneyLine"])
        draw_p = moneyline_to_prob(odds["drawOdds"]["moneyLine"])
    except (KeyError, TypeError):
        return None
    if home_p is None or away_p is None or draw_p is None:
        return None
    total = home_p + away_p + draw_p
    if not total:
        return None
    home_r = round(home_p / total * 100)
    draw_r = round(draw_p / total * 100)
    away_r = 100 - home_r - draw_r
    return {
        "provider": (odds.get("provider") or {}).get("name", "Unknown"),
        "homeWinPct": home_r,
        "drawPct": draw_r,
        "awayWinPct": away_r,
    }


def fetch_espn_context(home_name, away_name, kickoff_iso):
    """Real form, head-to-head and market-odds context for one
    fixture - every piece gracefully empty (not an error) when that
    specific piece isn't available, since real coverage varies."""
    event_id, home_espn_id, away_espn_id = find_espn_fixture(home_name, away_name, kickoff_iso)
    if not event_id:
        return EMPTY_ESPN_CONTEXT
    return build_espn_context(ESPN_LEAGUE_SLUG, event_id, home_espn_id, away_espn_id)


def build_espn_context(slug, event_id, home_espn_id, away_espn_id):
    """Same real form/H2H/odds context as fetch_espn_context, but for a
    fixture whose ESPN event id is already known (skips the
    scoreboard-search step) - used for friendlies, where the caller
    already found the event while filtering the scoreboard for tracked
    clubs (see fetch_todays_friendlies)."""
    try:
        summary = fetch_json(ESPN_SUMMARY_URL.format(slug=slug, event_id=event_id))
    except Exception:
        return EMPTY_ESPN_CONTEXT
    return {
        "homeForm": compute_form_score(summary.get("lastFiveGames"), home_espn_id),
        "awayForm": compute_form_score(summary.get("lastFiveGames"), away_espn_id),
        "h2h": compute_h2h_record(summary.get("seasonseries"), home_espn_id, away_espn_id),
        "marketOdds": extract_market_odds(summary),
    }


def compute_availability_score(team_id, elements):
    """0-1 real squad-availability score: ownership-weighted share of
    the squad that's actually available (real status "a"). Uses real
    selected_by_percent as an importance weight - a widely-owned player
    missing matters more than a fringe one, and ownership already
    reflects real manager consensus on who matters, not a guess this
    script invents. None if the squad sample is too small to trust
    (MIN_AVAILABILITY_SAMPLE - same small-sample caution as
    compute_squad_ratings elsewhere in this file)."""
    squad = [e for e in elements if e["team"] == team_id]
    if len(squad) < MIN_AVAILABILITY_SAMPLE:
        return None
    def weight(e):
        return float(e["selected_by_percent"] or 0) + 1
    total_weight = sum(weight(e) for e in squad)
    if not total_weight:
        return None
    available_weight = sum(weight(e) for e in squad if e.get("status") == "a")
    return available_weight / total_weight


def predict_fixture(home_team, away_team, squad_ratings, espn_context, home_availability, away_availability):
    """Home/draw/away percentages (always sum to exactly 100) plus a
    predicted scoreline, blended from real signals: FPL's own overall
    home/away strength rating, real last-season squad quality (points-
    per-90), real recent form (last 5 matches, recency-weighted), real
    squad availability (ownership-weighted real injury/suspension
    status), and real head-to-head history when at least 3 real
    meetings exist (same small-sample caution used throughout this
    file). Base rates (45/25/30) reflect the actual long-run Premier
    League home-advantage split. Any signal that isn't available for a
    given fixture is dropped from the blend entirely rather than
    treated as zero - see the compute_* functions above for exactly
    when and why each one can be missing. Still a transparent,
    documented heuristic, not a trained model or a black box, and the
    UI says so."""
    strength_diff = home_team["strength_overall_home"] - away_team["strength_overall_away"]
    home_quality = squad_ratings.get(home_team["id"])
    away_quality = squad_ratings.get(away_team["id"])
    quality_diff = (home_quality - away_quality) if (home_quality is not None and away_quality is not None) else 0

    form_diff = 0
    home_form = (espn_context or {}).get("homeForm")
    away_form = (espn_context or {}).get("awayForm")
    if home_form is not None and away_form is not None:
        form_diff = home_form - away_form

    availability_diff = 0
    if home_availability is not None and away_availability is not None:
        availability_diff = home_availability - away_availability

    h2h = (espn_context or {}).get("h2h")
    h2h_signal = 0
    if h2h and h2h["meetings"] >= 3:
        h2h_signal = (h2h["homeWins"] - h2h["awayWins"]) / h2h["meetings"]

    home_win = 45 + strength_diff * 7 + quality_diff * 5 + form_diff * 12 + availability_diff * 10 + h2h_signal * 8
    away_win = 30 - strength_diff * 6 - quality_diff * 4 - form_diff * 10 - availability_diff * 9 - h2h_signal * 6
    home_win = max(10, min(78, home_win))
    away_win = max(6, min(62, away_win))
    draw = 100 - home_win - away_win
    if draw < 8:
        deficit = 8 - draw
        scale = deficit / (home_win + away_win) if (home_win + away_win) else 0
        home_win -= home_win * scale
        away_win -= away_win * scale
        draw = 8

    home_win = round(home_win)
    draw = round(draw)
    away_win = 100 - home_win - draw  # exact after rounding

    edge = strength_diff * 0.15 + quality_diff * 0.1 + form_diff * 0.5 + availability_diff * 0.4
    home_goals = max(0.4, min(3.8, 1.5 + edge))
    away_goals = max(0.3, min(3.2, 1.1 - edge * 0.8))

    return {
        "homeWinPct": home_win,
        "drawPct": draw,
        "awayWinPct": away_win,
        "predictedScore": f"{home_goals:.1f} — {away_goals:.1f}",
        "factors": {
            "homeForm": round(home_form, 2) if home_form is not None else None,
            "awayForm": round(away_form, 2) if away_form is not None else None,
            "h2h": h2h,
            "homeAvailability": round(home_availability, 2) if home_availability is not None else None,
            "awayAvailability": round(away_availability, 2) if away_availability is not None else None,
        },
        "marketOdds": (espn_context or {}).get("marketOdds"),
    }


def build_recent_changes(home_team_id, away_team_id, teams, transfer_events, manager_changes, tracking_since):
    """Real, transparent squad-change context for one fixture - real
    transfer counts (from the permanent diff log) and any real,
    manually-verified manager change on file for either club. Kept
    separate from predict_fixture's output on purpose: there's no real
    evidence yet for how much either signal should move a win
    probability (see the ROSTER_SNAPSHOT_PATH comment), so this is
    shown to explain a prediction, not to justify one."""
    return {
        "trackingSince": tracking_since,
        "home": {
            "transfers": compute_squad_churn(home_team_id, transfer_events),
            "managerChange": recent_manager_change(teams[home_team_id], manager_changes),
        },
        "away": {
            "transfers": compute_squad_churn(away_team_id, transfer_events),
            "managerChange": recent_manager_change(teams[away_team_id], manager_changes),
        },
    }


def build_fixtures_list(fixtures, teams, teams_by_id, squad_ratings, elements, transfer_events, manager_changes, tracking_since):
    out = []
    for f in sorted(fixtures, key=lambda x: x["kickoff_time"] or ""):
        if not f["kickoff_time"]:
            continue
        kickoff = datetime.fromisoformat(f["kickoff_time"].replace("Z", "+00:00"))
        home_name = teams[f["team_h"]]
        away_name = teams[f["team_a"]]
        espn_context = fetch_espn_context(home_name, away_name, f["kickoff_time"])
        home_availability = compute_availability_score(f["team_h"], elements)
        away_availability = compute_availability_score(f["team_a"], elements)
        entry = {
            "id": f["id"],
            "home": home_name,
            "away": away_name,
            "kickoffISO": f["kickoff_time"],
            "kickoffLabel": kickoff.strftime("%a %d %b · %H:%M UTC"),
            "recentChanges": build_recent_changes(f["team_h"], f["team_a"], teams, transfer_events, manager_changes, tracking_since),
        }
        entry.update(predict_fixture(teams_by_id[f["team_h"]], teams_by_id[f["team_a"]], squad_ratings, espn_context, home_availability, away_availability))
        out.append(entry)
    return out


def match_fpl_team(espn_display_name, teams):
    """Real FPL team id for an ESPN display name, or None if it isn't
    one of the 20 tracked Premier League clubs - reuses the same
    containment matching verified against all 20 real clubs for
    competitive fixtures (see names_match)."""
    for team_id, name in teams.items():
        if names_match(normalize_team_name(name), espn_display_name):
            return team_id
    return None


def fetch_todays_friendlies(teams):
    """Real pre-season club friendlies happening today, restricted to
    matches where both clubs are real Premier League clubs (see the
    FRIENDLY_SLUG constant's comment for why cross-league friendlies
    are skipped rather than half-predicted). Each entry carries both
    the real FPL team id (for squad_ratings/predict_fixture) and the
    real ESPN team id (for form/H2H/odds lookups) for both sides."""
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    try:
        data = fetch_json(ESPN_SCOREBOARD_URL.format(slug=FRIENDLY_SLUG, date=today))
    except Exception:
        return []
    out = []
    for ev in data.get("events", []):
        comp = ev["competitions"][0]
        home = next((c for c in comp["competitors"] if c["homeAway"] == "home"), None)
        away = next((c for c in comp["competitors"] if c["homeAway"] == "away"), None)
        if not home or not away:
            continue
        home_team_id = match_fpl_team(home["team"]["displayName"], teams)
        away_team_id = match_fpl_team(away["team"]["displayName"], teams)
        if home_team_id is None or away_team_id is None:
            continue
        out.append({
            "eventId": ev["id"],
            "kickoffISO": ev.get("date"),
            "homeTeamId": home_team_id,
            "awayTeamId": away_team_id,
            "homeEspnId": home["team"]["id"],
            "awayEspnId": away["team"]["id"],
        })
    return out


def build_friendly_predictions(friendly_events, teams, teams_by_id, squad_ratings, elements, transfer_events, manager_changes, tracking_since):
    """Real predictions for today's PL-vs-PL friendlies, using the same
    predict_fixture engine as competitive fixtures - the event id is
    already known from fetch_todays_friendlies, so context comes
    straight from build_espn_context rather than re-searching."""
    out = []
    for fx in friendly_events:
        espn_context = build_espn_context(FRIENDLY_SLUG, fx["eventId"], fx["homeEspnId"], fx["awayEspnId"])
        home_availability = compute_availability_score(fx["homeTeamId"], elements)
        away_availability = compute_availability_score(fx["awayTeamId"], elements)
        kickoff = datetime.fromisoformat(fx["kickoffISO"].replace("Z", "+00:00")) if fx["kickoffISO"] else None
        entry = {
            "id": f"friendly-{fx['eventId']}",
            "eventId": fx["eventId"],
            "home": teams[fx["homeTeamId"]],
            "away": teams[fx["awayTeamId"]],
            "kickoffISO": fx["kickoffISO"],
            "kickoffLabel": kickoff.strftime("%a %d %b · %H:%M UTC") if kickoff else None,
            "recentChanges": build_recent_changes(fx["homeTeamId"], fx["awayTeamId"], teams, transfer_events, manager_changes, tracking_since),
        }
        entry.update(predict_fixture(
            teams_by_id[fx["homeTeamId"]], teams_by_id[fx["awayTeamId"]],
            squad_ratings, espn_context, home_availability, away_availability,
        ))
        out.append(entry)
    return out


def log_friendly_predictions(friendly_predictions):
    """Same append-only, never-overwritten logging as log_predictions,
    kept in a separate file so friendly accuracy is never blended into
    the competitive-season track record (see FRIENDLY_SLUG comment)."""
    try:
        with open(FRIENDLY_PREDICTIONS_LOG_PATH, "r", encoding="utf-8") as f:
            archive = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        archive = {"predictions": []}

    existing_ids = {p["id"] for p in archive.get("predictions", [])}
    added = 0
    for fx in friendly_predictions:
        if fx["id"] in existing_ids:
            continue
        archive["predictions"].append({
            "id": fx["id"],
            "eventId": fx["eventId"],
            "home": fx["home"],
            "away": fx["away"],
            "kickoffISO": fx["kickoffISO"],
            "homeWinPct": fx["homeWinPct"],
            "drawPct": fx["drawPct"],
            "awayWinPct": fx["awayWinPct"],
            "predictedScore": fx["predictedScore"],
            "marketOdds": fx.get("marketOdds"),
            "loggedAt": datetime.now(timezone.utc).isoformat(),
            "resolved": False,
            "actualResult": None,
            "actualScore": None,
            "modelCorrect": None,
            "marketCorrect": None,
        })
        existing_ids.add(fx["id"])
        added += 1

    archive["predictions"].sort(key=lambda p: p["kickoffISO"] or "")

    with open(FRIENDLY_PREDICTIONS_LOG_PATH, "w", encoding="utf-8") as f:
        json.dump(archive, f, indent=2)

    return added, len(archive["predictions"])


def resolve_friendly_predictions():
    """Unlike competitive fixtures, friendly results never land in
    data/match-history.json (that file is built from FPL's own
    /fixtures/ endpoint, which doesn't carry friendlies at all) - so
    each unresolved friendly is checked directly against its own real
    ESPN summary for a real final score, using the same
    status.type.completed field ESPN itself uses to mark a match
    finished."""
    try:
        with open(FRIENDLY_PREDICTIONS_LOG_PATH, "r", encoding="utf-8") as f:
            archive = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return 0, 0

    newly_resolved = 0
    for p in archive.get("predictions", []):
        if p["resolved"]:
            continue
        try:
            summary = fetch_json(ESPN_SUMMARY_URL.format(slug=FRIENDLY_SLUG, event_id=p["eventId"]))
            comp = summary["header"]["competitions"][0]
        except Exception:
            continue
        if not comp["status"]["type"]["completed"]:
            continue
        home_c = next((c for c in comp["competitors"] if c["homeAway"] == "home"), None)
        away_c = next((c for c in comp["competitors"] if c["homeAway"] == "away"), None)
        if not home_c or not away_c or home_c.get("score") is None or away_c.get("score") is None:
            continue
        try:
            h_score = float(home_c["score"])
            a_score = float(away_c["score"])
        except (TypeError, ValueError):
            continue

        if h_score > a_score: actual = "home"
        elif h_score < a_score: actual = "away"
        else: actual = "draw"

        model_favored = _favored_outcome(p["homeWinPct"], p["drawPct"], p["awayWinPct"])
        p["resolved"] = True
        p["actualResult"] = actual
        p["actualScore"] = f"{h_score:g} — {a_score:g}"
        p["modelCorrect"] = model_favored == actual
        if p.get("marketOdds"):
            market_favored = _favored_outcome(p["marketOdds"]["homeWinPct"], p["marketOdds"]["drawPct"], p["marketOdds"]["awayWinPct"])
            p["marketCorrect"] = market_favored == actual
        newly_resolved += 1

    with open(FRIENDLY_PREDICTIONS_LOG_PATH, "w", encoding="utf-8") as f:
        json.dump(archive, f, indent=2)

    return newly_resolved, sum(1 for p in archive.get("predictions", []) if p["resolved"])


def compute_friendly_track_record():
    """Same shape as compute_prediction_track_record, kept as a
    separate real number so it's never confused with competitive-match
    accuracy - friendly squads are often rotated, so this is honestly a
    lower-confidence sample, and the UI says so."""
    try:
        with open(FRIENDLY_PREDICTIONS_LOG_PATH, "r", encoding="utf-8") as f:
            archive = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        archive = {"predictions": []}

    resolved = [p for p in archive.get("predictions", []) if p["resolved"]]
    correct = sum(1 for p in resolved if p["modelCorrect"])

    return {
        "totalLogged": len(archive.get("predictions", [])),
        "totalResolved": len(resolved),
        "correct": correct,
        "accuracyPct": round(correct / len(resolved) * 100, 1) if resolved else None,
    }


def build_fixture_lookup(fixtures, teams):
    """team_id -> {opponent, isHome, fdr, fdrClass} for the given gameweek's fixtures."""
    lookup = {}
    for f in fixtures:
        lookup[f["team_h"]] = {
            "opponent": teams[f["team_a"]],
            "isHome": True,
            "fdr": f["team_h_difficulty"],
            "fdrClass": FDR_CLASS.get(f["team_h_difficulty"], "mid"),
        }
        lookup[f["team_a"]] = {
            "opponent": teams[f["team_h"]],
            "isHome": False,
            "fdr": f["team_a_difficulty"],
            "fdrClass": FDR_CLASS.get(f["team_a_difficulty"], "mid"),
        }
    return lookup


def compute_fixture_swing(all_fixtures, next_event_id, teams):
    """team_id -> {nearFdr, laterFdr, swing, direction, fixtures: [...]} over
    a SWING_WINDOW-gameweek horizon starting at the next gameweek.

    'swing' is nearFdr - laterFdr: positive means the near-term run is
    HARDER than what follows (fixtures are about to improve - classic
    transfer-in / wildcard-in signal); negative means the opposite
    (fixtures about to get tougher - transfer-out / bench signal).

    Checked before building this: the current full-season fixture list
    has no blank or double gameweeks yet (every gameweek has exactly 20
    teams playing once) - those come from mid-season cup reschedules
    that haven't happened yet, not something this data can show this
    early. Fixture-swing (get easier/harder) is a real, available
    signal in the meantime and is the standard basis real FPL advice
    uses anyway."""
    window_end = next_event_id + SWING_WINDOW - 1
    window_fixtures = [f for f in all_fixtures if f["event"] and next_event_id <= f["event"] <= window_end]

    by_team = {}
    for f in sorted(window_fixtures, key=lambda x: x["event"]):
        for side, opp_side, is_home in (("team_h", "team_a", True), ("team_a", "team_h", False)):
            team_id = f[side]
            fdr = f[f"{side}_difficulty"]
            by_team.setdefault(team_id, []).append({
                "event": f["event"],
                "opponent": teams[f[opp_side]],
                "isHome": is_home,
                "fdr": fdr,
            })

    swing = {}
    half = max(1, SWING_WINDOW // 2)
    for team_id, fixtures in by_team.items():
        fixtures.sort(key=lambda x: x["event"])
        near = fixtures[:half]
        later = fixtures[half:]
        near_fdr = sum(f["fdr"] for f in near) / len(near) if near else None
        later_fdr = sum(f["fdr"] for f in later) / len(later) if later else None
        swing_score = (near_fdr - later_fdr) if (near_fdr is not None and later_fdr is not None) else 0
        swing[team_id] = {
            "nearFdr": round(near_fdr, 2) if near_fdr is not None else None,
            "laterFdr": round(later_fdr, 2) if later_fdr is not None else None,
            "swing": round(swing_score, 2),
            "fixtures": [f"{'vs' if f['isHome'] else '@'} {f['opponent']}" for f in fixtures],
        }
    return swing


def extract_match_events(fixture, elements_by_id):
    """Real per-match events (scorer, assister, cards, etc.) from the
    fixture's own "stats" block - each entry names a real player id and
    a real value, straight from the API, not derived."""
    events = []
    for stat in fixture.get("stats") or []:
        identifier = stat.get("identifier")
        if identifier not in MATCH_EVENT_TYPES:
            continue
        for side, side_label in (("h", "home"), ("a", "away")):
            for entry in stat.get(side) or []:
                element = elements_by_id.get(entry["element"])
                if not element:
                    continue
                events.append({
                    "type": identifier,
                    "player": element.get("web_name"),
                    "side": side_label,
                    "value": entry["value"],
                })
    return events


def load_roster_snapshot():
    """Last run's real player_id -> {team, name} snapshot, or an empty
    one (with no trackingSince yet) if this is the first run ever -
    see detect_transfers for how this becomes a real diff."""
    try:
        with open(ROSTER_SNAPSHOT_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"trackingSince": None, "players": {}}


def detect_transfers(elements, teams, previous_snapshot):
    """Real transfers detected by diffing this run's real roster
    against the last run's - a player who was on a different real club
    last run and is on this one now genuinely moved. A player with no
    previous entry (new to the database entirely - a fresh signing
    from outside the league, a promoted club's player appearing for
    the first time) is deliberately NOT counted as a transfer: there's
    no real prior state to compare against, so there's nothing to
    diff, not a transfer to report."""
    previous_players = previous_snapshot.get("players", {})
    detected_at = datetime.now(timezone.utc).isoformat()
    events = []
    for e in elements:
        prev = previous_players.get(str(e["id"]))
        if prev is None:
            continue
        if prev["team"] != e["team"]:
            events.append({
                "playerId": e["id"],
                "playerName": e.get("web_name"),
                "fromTeamId": prev["team"],
                "fromTeam": teams.get(prev["team"], "Unknown"),
                "toTeamId": e["team"],
                "toTeam": teams[e["team"]],
                "detectedAt": detected_at,
            })
    return events


def log_transfers(transfer_events):
    """Append real detected transfers to a permanent, append-only
    data/transfer-log.json - each event only exists for the one run
    where the diff caught it (see detect_transfers), so unlike the
    prediction logs there's no id to dedupe against; every call here
    is genuinely new."""
    if not transfer_events:
        return 0
    try:
        with open(TRANSFER_LOG_PATH, "r", encoding="utf-8") as f:
            archive = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        archive = {"transfers": []}
    archive["transfers"].extend(transfer_events)
    with open(TRANSFER_LOG_PATH, "w", encoding="utf-8") as f:
        json.dump(archive, f, indent=2)
    return len(transfer_events)


def save_roster_snapshot(elements, teams, previous_snapshot):
    """Persist this run's real player->team state as the baseline for
    next run's diff. trackingSince is set once, the first time this
    file is ever created, and never touched again - it's what lets the
    UI say "0 transfers since tracking began Aug 12" instead of
    implying a club has been transfer-free for longer than this
    feature has actually been watching."""
    tracking_since = previous_snapshot.get("trackingSince") or datetime.now(timezone.utc).isoformat()
    snapshot = {
        "trackingSince": tracking_since,
        "players": {str(e["id"]): {"team": e["team"], "name": e.get("web_name")} for e in elements},
    }
    with open(ROSTER_SNAPSHOT_PATH, "w", encoding="utf-8") as f:
        json.dump(snapshot, f, indent=2)
    return tracking_since


def load_transfer_log():
    """Every real detected transfer on file, loaded once per run and
    reused across every fixture's churn lookup rather than re-reading
    data/transfer-log.json per team."""
    try:
        with open(TRANSFER_LOG_PATH, "r", encoding="utf-8") as f:
            return json.load(f).get("transfers", [])
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def compute_squad_churn(team_id, transfer_events, window_days=SQUAD_CHURN_WINDOW_DAYS):
    """Real count of transfers in/out for a club within a recent real
    window, from the already-loaded transfer log - always a real
    number (0 is a legitimate real answer, not a missing one), context
    only, never fed into predict_fixture's math (see the
    ROSTER_SNAPSHOT_PATH comment for why)."""
    cutoff = datetime.now(timezone.utc).timestamp() - window_days * 86400
    in_count = out_count = 0
    for t in transfer_events:
        try:
            detected = datetime.fromisoformat(t["detectedAt"]).timestamp()
        except (KeyError, ValueError):
            continue
        if detected < cutoff:
            continue
        if t["toTeamId"] == team_id:
            in_count += 1
        elif t["fromTeamId"] == team_id:
            out_count += 1
    return {"in": in_count, "out": out_count, "windowDays": window_days}


def load_manager_changes():
    """Real, manually curated manager/head-coach changes from
    data/manager-changes.json - this function only ever reads the
    file, never writes it, so hand-added or search-verified entries
    are never at risk of being overwritten by an automated run."""
    try:
        with open(MANAGER_CHANGES_PATH, "r", encoding="utf-8") as f:
            return json.load(f).get("changes", [])
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def recent_manager_change(team_name, manager_changes):
    """Most recent real manager change on file for a club, or None if
    none is recorded - real, sourced data only (see
    data/manager-changes.json's own note field), never a guess."""
    matches = [c for c in manager_changes if c.get("team") == team_name]
    if not matches:
        return None
    return sorted(matches, key=lambda c: c.get("effectiveDate") or "", reverse=True)[0]


def build_match_history(all_fixtures, teams, elements_by_id):
    """Real finished-fixture results (score + events) for this run's
    snapshot of all_fixtures - see update_match_history_file for how
    these get merged into a permanent, append-only archive."""
    matches = []
    for f in all_fixtures:
        if not f.get("finished"):
            continue
        matches.append({
            "id": f["id"],
            "gameweek": f["event"],
            "kickoffISO": f["kickoff_time"],
            "home": teams[f["team_h"]],
            "away": teams[f["team_a"]],
            "homeScore": f["team_h_score"],
            "awayScore": f["team_a_score"],
            "events": extract_match_events(f, elements_by_id),
        })
    return matches


def update_match_history_file(new_matches, season_label):
    """Merge this run's finished matches into data/match-history.json,
    deduped by fixture id so re-running never creates duplicates and a
    match already recorded is never overwritten. Returns the number of
    genuinely new matches added, for the run's own log output."""
    try:
        with open(MATCH_HISTORY_PATH, "r", encoding="utf-8") as f:
            archive = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        archive = {"season": season_label, "matches": []}

    existing_ids = {m["id"] for m in archive.get("matches", [])}
    added = 0
    for m in new_matches:
        if m["id"] not in existing_ids:
            archive["matches"].append(m)
            existing_ids.add(m["id"])
            added += 1

    archive["season"] = season_label
    archive["matches"].sort(key=lambda m: m["kickoffISO"] or "")
    archive["generatedAt"] = datetime.now(timezone.utc).isoformat()

    with open(MATCH_HISTORY_PATH, "w", encoding="utf-8") as f:
        json.dump(archive, f, indent=2)

    return added, len(archive["matches"])


def log_predictions(fixtures_list):
    """Append this run's real predictions to a permanent, append-only
    data/predictions-log.json, deduped by real FPL fixture id - a
    prediction already logged for a fixture is NEVER overwritten, even
    as later runs see fresher form/odds data, because the whole point
    of backtesting is judging what the model said BEFORE kickoff, not
    a hindsight-adjusted version of it. Mirrors update_match_history_file's
    dedup pattern above. Only fixtures with a real kickoff time and a
    real prediction are logged."""
    try:
        with open(PREDICTIONS_LOG_PATH, "r", encoding="utf-8") as f:
            archive = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        archive = {"predictions": []}

    existing_ids = {p["id"] for p in archive.get("predictions", [])}
    added = 0
    for fx in fixtures_list:
        if fx["id"] in existing_ids:
            continue
        archive["predictions"].append({
            "id": fx["id"],
            "home": fx["home"],
            "away": fx["away"],
            "kickoffISO": fx["kickoffISO"],
            "homeWinPct": fx["homeWinPct"],
            "drawPct": fx["drawPct"],
            "awayWinPct": fx["awayWinPct"],
            "predictedScore": fx["predictedScore"],
            "marketOdds": fx.get("marketOdds"),
            "loggedAt": datetime.now(timezone.utc).isoformat(),
            "resolved": False,
            "actualResult": None,
            "modelCorrect": None,
            "marketCorrect": None,
        })
        existing_ids.add(fx["id"])
        added += 1

    archive["predictions"].sort(key=lambda p: p["kickoffISO"] or "")

    with open(PREDICTIONS_LOG_PATH, "w", encoding="utf-8") as f:
        json.dump(archive, f, indent=2)

    return added, len(archive["predictions"])


def _favored_outcome(home_pct, draw_pct, away_pct):
    """Which outcome a set of percentages favors - home/draw/away ties
    broken toward home then draw, an arbitrary but fixed rule applied
    identically to both the model's and the market's percentages so
    the comparison between them is fair."""
    best = max(home_pct, draw_pct, away_pct)
    if home_pct == best:
        return "home"
    if draw_pct == best:
        return "draw"
    return "away"


def resolve_predictions(match_history_matches):
    """Cross-reference every unresolved logged prediction against real
    finished results in data/match-history.json by shared real FPL
    fixture id - no ESPN lookup needed at resolution time since both
    files already key on the same id. A prediction is resolved exactly
    once and never re-touched afterward, so accuracy stats only ever
    grow, they don't get revised."""
    try:
        with open(PREDICTIONS_LOG_PATH, "r", encoding="utf-8") as f:
            archive = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return 0, 0

    results_by_id = {m["id"]: m for m in match_history_matches}
    newly_resolved = 0
    for p in archive.get("predictions", []):
        if p["resolved"]:
            continue
        match = results_by_id.get(p["id"])
        if not match or match["homeScore"] is None or match["awayScore"] is None:
            continue
        if match["homeScore"] > match["awayScore"]:
            actual = "home"
        elif match["homeScore"] < match["awayScore"]:
            actual = "away"
        else:
            actual = "draw"

        model_favored = _favored_outcome(p["homeWinPct"], p["drawPct"], p["awayWinPct"])
        p["resolved"] = True
        p["actualResult"] = actual
        p["actualScore"] = f"{match['homeScore']} — {match['awayScore']}"
        p["modelCorrect"] = model_favored == actual
        if p.get("marketOdds"):
            market_favored = _favored_outcome(p["marketOdds"]["homeWinPct"], p["marketOdds"]["drawPct"], p["marketOdds"]["awayWinPct"])
            p["marketCorrect"] = market_favored == actual
        newly_resolved += 1

    with open(PREDICTIONS_LOG_PATH, "w", encoding="utf-8") as f:
        json.dump(archive, f, indent=2)

    return newly_resolved, sum(1 for p in archive.get("predictions", []) if p["resolved"])


def compute_prediction_track_record():
    """Real, transparent aggregate accuracy from every resolved
    prediction ever logged - not a fabricated figure. Deliberately
    includes the raw resolved count alongside the percentage, since a
    91% accuracy from 3 games means nothing and the UI should be able
    to say so. Also reports market-favorite accuracy on the same
    resolved subset where real odds were available, so the model's
    real performance can be honestly compared against what a bookmaker
    already implies, rather than against an arbitrary bar like 90%."""
    try:
        with open(PREDICTIONS_LOG_PATH, "r", encoding="utf-8") as f:
            archive = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        archive = {"predictions": []}

    resolved = [p for p in archive.get("predictions", []) if p["resolved"]]
    correct = sum(1 for p in resolved if p["modelCorrect"])
    with_market = [p for p in resolved if p.get("marketCorrect") is not None]
    market_correct = sum(1 for p in with_market if p["marketCorrect"])

    return {
        "totalLogged": len(archive.get("predictions", [])),
        "totalResolved": len(resolved),
        "correct": correct,
        "accuracyPct": round(correct / len(resolved) * 100, 1) if resolved else None,
        "marketComparison": {
            "sampleSize": len(with_market),
            "marketAccuracyPct": round(market_correct / len(with_market) * 100, 1) if with_market else None,
            "modelAccuracyPct": round(sum(1 for p in with_market if p["modelCorrect"]) / len(with_market) * 100, 1) if with_market else None,
        } if with_market else None,
    }


def build_teams_list(data, squad_ratings):
    """Real 20-club roster with aggregate stats derived from real player
    data (squad rating = avg points-per-90 among players with minutes,
    last season; squad value = sum of real current prices). No league
    position/form here - both are genuinely 0/null pre-season (0 games
    played), not a data gap, just nothing to report yet."""
    by_team = {}
    for e in data["elements"]:
        by_team.setdefault(e["team"], []).append(e)

    # Rank only among teams with a trustworthy rating - a promoted club
    # with no rating shouldn't get "rank #18" by default sort order.
    ranked_ids = sorted(
        (tid for tid, r in squad_ratings.items() if r is not None),
        key=lambda tid: squad_ratings[tid],
        reverse=True,
    )
    league_rank = {tid: i + 1 for i, tid in enumerate(ranked_ids)}

    out = []
    for t in data["teams"]:
        squad = by_team.get(t["id"], [])
        avg_rating = squad_ratings.get(t["id"])
        squad_value = sum(e["now_cost"] for e in squad) / 10
        out.append({
            "name": t["name"],
            "shortName": t["short_name"],
            "crestClass": CREST_CLASSES[t["id"] % len(CREST_CLASSES)],
            "squadSize": len(squad),
            "squadRating": round(avg_rating, 2) if avg_rating is not None else None,
            "squadValue": f"£{squad_value:.1f}m",
            "leagueRank": league_rank.get(t["id"]),
            "strengthHome": t["strength_overall_home"],
            "strengthAway": t["strength_overall_away"],
        })
    out.sort(key=lambda t: t["name"])
    return out


def compute_percentiles(eligible):
    """element id -> percentile rank (0-100) of points-per-90 within the
    player's own position group, among players with a real sample of
    minutes (>=450, ~5 full matches - same small-sample caution as
    compute_squad_ratings, just at player scale instead of team scale)."""
    by_position = {}
    for e in eligible:
        if e["minutes"] >= 450:
            by_position.setdefault(e["element_type"], []).append(e)

    percentiles = {}
    for pos, players in by_position.items():
        rates = sorted((p["id"], (p["total_points"] / p["minutes"]) * 90) for p in players)
        rates.sort(key=lambda pair: pair[1])
        n = len(rates)
        for rank, (pid, _) in enumerate(rates):
            percentiles[pid] = round((rank + 1) / n * 100)
    return percentiles


def build_leaderboards(eligible):
    """Real, transparent rankings for the Stats view - top 5 each, no
    model involved, just sorting real fields. Value-for-money requires
    a minutes floor (900, ~10 matches) for the same reason team/player
    ratings elsewhere need one: a cheap player with a lucky start and
    almost no minutes would otherwise top the list on noise."""
    by_xg = sorted(eligible, key=lambda e: float(e["expected_goals"] or 0), reverse=True)[:5]
    by_assists = sorted(eligible, key=lambda e: e["assists"], reverse=True)[:5]
    by_points = sorted(eligible, key=lambda e: e["total_points"], reverse=True)[:5]
    value_pool = [e for e in eligible if e["minutes"] >= 900]
    by_value = sorted(value_pool, key=lambda e: e["total_points"] / (e["now_cost"] / 10), reverse=True)[:5]
    by_tackles = sorted(eligible, key=lambda e: e["tackles"], reverse=True)[:5]
    goalkeepers = [e for e in eligible if e["element_type"] == 1 and e["minutes"] >= 900]
    by_saves = sorted(goalkeepers, key=lambda e: e["saves"], reverse=True)[:5]
    return {
        "points": by_points, "assists": by_assists, "xg": by_xg, "value": by_value,
        "tackles": by_tackles, "saves": by_saves,
    }


def build_wildcard_watch(swing, teams, top_n=3):
    """Top N teams whose fixtures are about to improve the most - the
    real, available half of "when to wildcard" (see compute_fixture_swing
    for why blank/double gameweeks aren't in this yet)."""
    ranked = sorted(swing.items(), key=lambda kv: kv[1]["swing"], reverse=True)[:top_n]
    return [{
        "team": teams[tid],
        "swing": s["swing"],
        "nearFdr": s["nearFdr"],
        "laterFdr": s["laterFdr"],
        "fixtures": s["fixtures"],
    } for tid, s in ranked]


def build_transfer_advice(eligible, swing, teams_by_id):
    """Real transfer IN/OUT candidates from real fixture-swing + squad
    quality - not fabricated reasoning. IN: best point-scorer from each
    of the top-3 improving-fixture teams. OUT: the most-owned player
    from the team with the worst (most-worsening) fixture swing, since
    "transfer out" only makes sense for someone plausibly already
    owned. Requires a real minutes sample (>=450) so a fringe player
    with a lucky cameo doesn't get recommended."""
    sample = [e for e in eligible if e["minutes"] >= 450]
    by_team = {}
    for e in sample:
        by_team.setdefault(e["team"], []).append(e)

    improving = sorted(swing.items(), key=lambda kv: kv[1]["swing"], reverse=True)
    transfers_in = []
    for team_id, _ in improving:
        squad = by_team.get(team_id, [])
        if not squad:
            continue
        best = max(squad, key=lambda e: e["total_points"])
        transfers_in.append(best)
        if len(transfers_in) == 2:
            break

    worsening = sorted(swing.items(), key=lambda kv: kv[1]["swing"])
    transfers_out = []
    in_ids = {e["id"] for e in transfers_in}
    for team_id, _ in worsening:
        squad = [e for e in by_team.get(team_id, []) if e["id"] not in in_ids]
        if not squad:
            continue
        most_owned = max(squad, key=lambda e: float(e["selected_by_percent"] or 0))
        transfers_out.append(most_owned)
        break

    return transfers_in, transfers_out


def build_price_movement(eligible, top_n=5):
    """Real price-change fields, straight from the API - cost_change_event
    is the change during the current gameweek (in tenths of a million,
    same unit now_cost already uses). Genuinely 0 for everyone this
    early in pre-season (checked directly), not a bug - populates once
    real price moves start happening after the season kicks off."""
    changed = [e for e in eligible if e["cost_change_event"] != 0]
    risers = sorted((e for e in changed if e["cost_change_event"] > 0), key=lambda e: -e["cost_change_event"])[:top_n]
    fallers = sorted((e for e in changed if e["cost_change_event"] < 0), key=lambda e: e["cost_change_event"])[:top_n]
    return risers, fallers


def find_stats_event(events):
    """The gameweek to pull live per-gameweek stats for: the most
    recently finished one, or the one currently in progress. None
    pre-season, before any gameweek has kicked off - event/{id}/live
    returns no elements at all until a gameweek actually starts."""
    finished = [ev for ev in events if ev.get("finished")]
    if finished:
        return max(finished, key=lambda ev: ev["id"])
    return next((ev for ev in events if ev.get("is_current")), None)


def build_gameweek_performers(eligible, live_stats, top_n=5):
    """Real per-gameweek stat breakdowns (not season totals) for
    whichever gameweek find_stats_event picked - goals/assists/bonus/
    saves/defensive actions THIS gameweek specifically, using FPL's own
    documented stat identifiers (checked against the API's own
    element_stats list before writing this, not assumed). Empty dict
    for every category when live_stats is empty (pre-season)."""
    pool = [e for e in eligible if e["id"] in live_stats]

    def top(stat_key):
        ranked = sorted(pool, key=lambda e: -live_stats[e["id"]].get(stat_key, 0))
        return [e for e in ranked[:top_n] if live_stats[e["id"]].get(stat_key, 0) > 0]

    return {
        "points": top("total_points"),
        "goals": top("goals_scored"),
        "assists": top("assists"),
        "defensive": top("defensive_contribution"),
        "bonus": top("bonus"),
        "saves": top("saves"),
    }


def build_injury_report(eligible, top_n=8):
    """Real availability status straight from the API's own status/news
    fields - not inferred. "Improving" (recently more available, a real
    proxy for "returning from injury") compares FPL's own this-round vs
    next-round chance-of-playing percentages - both real published
    fields, so next > this is a genuine forward-looking signal already
    in the data, not a guess built on top of it."""
    flagged = [e for e in eligible if e.get("status") != "a" and e.get("news")]
    out = []
    for e in flagged[:top_n]:
        this_chance = e.get("chance_of_playing_this_round")
        next_chance = e.get("chance_of_playing_next_round")
        improving = bool(this_chance is not None and next_chance is not None and next_chance > this_chance)
        out.append((e, this_chance, next_chance, improving))
    return out


def build_rotation_watch(eligible, top_n=6):
    """Real starts count, ranked - the reliable signal for "who's a
    nailed starter". minutes/starts (average minutes per start) was
    tried first and dropped: minutes includes substitute-appearance
    time that isn't reflected in starts at all, so a player with few
    starts but heavy sub minutes produces a nonsensical "300 minutes
    per start" - caught by inspecting the real generated output before
    shipping, not by reasoning about the code. starts on its own, with
    real total minutes alongside it for context, is what this data can
    honestly support without a per-match minutes breakdown this API
    doesn't expose cheaply."""
    pool = [e for e in eligible if e["minutes"] >= MIN_MINUTES_FOR_ROTATION]
    ranked = sorted(pool, key=lambda e: -e["starts"])
    return [(e, e["starts"]) for e in ranked[:top_n]]


def build_ownership_watch(eligible, top_n=5):
    """Real ownership % plus real net transfer movement THIS gameweek
    (transfers_in_event minus transfers_out_event) - both direct API
    fields, no historical snapshot tracking of our own needed. Shown
    alongside real recent form so a manager can judge for themselves
    whether the move looks justified, rather than this script asserting
    a verdict. Genuinely flat pre-season (same as price movement)."""
    def net(e):
        return e["transfers_in_event"] - e["transfers_out_event"]
    moved = [e for e in eligible if net(e) != 0]
    rising = sorted(moved, key=lambda e: -net(e))[:top_n]
    falling = sorted(moved, key=lambda e: net(e))[:top_n]
    return [(e, net(e)) for e in rising], [(e, net(e)) for e in falling]


def build_player(e, teams, fixture_lookup, teams_by_id, percentiles):
    name = e.get("web_name") or f"{e['first_name']} {e['second_name']}"
    full_name = f"{e['first_name']} {e['second_name']}".strip()
    fixture = fixture_lookup.get(e["team"])
    team = teams_by_id[e["team"]]
    player = {
        "id": e["id"],
        "name": full_name or name,
        "shortName": name,
        "position": POSITIONS.get(e["element_type"], "?"),
        "team": teams[e["team"]],
        "avatar": initials(full_name or name),
        "avatarClass": avatar_class(e["id"]),
        "price": price_str(e["now_cost"]),
        "owned": f"{float(e['selected_by_percent']):.1f}%",
        "points": e["total_points"],
        "epNext": float(e["ep_next"] or 0),
        "form": float(e["form"] or 0),
        "minutes": e["minutes"],
        "goals": e["goals_scored"],
        "assists": e["assists"],
        "xg": round(float(e["expected_goals"] or 0), 2),
        "xa": round(float(e["expected_assists"] or 0), 2),
        "valueScore": round(e["total_points"] / (e["now_cost"] / 10), 1) if e["now_cost"] else 0,
        "tackles": e["tackles"],
        "clearancesBlocksInterceptions": e["clearances_blocks_interceptions"],
        "recoveries": e["recoveries"],
        "saves": e["saves"],
        "cleanSheets": e["clean_sheets"],
        "positionPercentile": percentiles.get(e["id"]),
        "teamStrengthHome": team["strength_overall_home"],
        "teamStrengthAway": team["strength_overall_away"],
    }
    if fixture:
        player["fixture"] = f"vs {fixture['opponent']} ({'H' if fixture['isHome'] else 'A'})"
        player["fdr"] = fixture["fdr"]
        player["fdrClass"] = fixture["fdrClass"]
    return player


def main():
    data = fetch_json(BOOTSTRAP_URL)
    teams = {t["id"]: t["name"] for t in data["teams"]}
    teams_by_id = {t["id"]: t for t in data["teams"]}
    squad_ratings = compute_squad_ratings(data)

    # Real squad-change detection: diff this run's roster against the
    # last one BEFORE anything else touches data["elements"], so the
    # snapshot saved for next run's diff reflects this run's true
    # state either way.
    previous_roster = load_roster_snapshot()
    transfer_events = detect_transfers(data["elements"], teams, previous_roster)
    transfers_added = log_transfers(transfer_events)
    tracking_since = save_roster_snapshot(data["elements"], teams, previous_roster)
    print(f"data/transfer-log.json: {transfers_added} real transfer(s) detected this run")
    all_transfer_events = load_transfer_log()
    manager_changes = load_manager_changes()

    next_event = next((ev for ev in data["events"] if ev.get("is_next")), data["events"][0])
    fixtures = fetch_json(FIXTURES_URL.format(event_id=next_event["id"]))
    fixture_lookup = build_fixture_lookup(fixtures, teams)
    fixtures_list = build_fixtures_list(fixtures, teams, teams_by_id, squad_ratings, data["elements"], all_transfer_events, manager_changes, tracking_since)
    teams_list = build_teams_list(data, squad_ratings)

    all_fixtures = fetch_json(ALL_FIXTURES_URL)
    fixture_swing = compute_fixture_swing(all_fixtures, next_event["id"], teams)
    wildcard_watch = build_wildcard_watch(fixture_swing, teams)

    elements_by_id = {e["id"]: e for e in data["elements"]}
    finished_matches = build_match_history(all_fixtures, teams, elements_by_id)
    added, total = update_match_history_file(finished_matches, CURRENT_SEASON)
    print(f"data/match-history.json: {added} new finished match(es) added, {total} total")

    # Predictions are logged BEFORE outcomes are known (this run's
    # upcoming-fixture predictions), then resolved against whatever
    # matches this run's match-history update just confirmed finished -
    # see log_predictions/resolve_predictions for why order matters here.
    logged_added, logged_total = log_predictions(fixtures_list)
    print(f"data/predictions-log.json: {logged_added} new prediction(s) logged, {logged_total} total")
    resolved_added, resolved_total = resolve_predictions(finished_matches)
    print(f"data/predictions-log.json: {resolved_added} newly resolved, {resolved_total} total resolved")
    prediction_track_record = compute_prediction_track_record()

    # Real today-only PL-vs-PL friendlies, predicted and tracked
    # separately from the competitive-season numbers above (see
    # FRIENDLY_SLUG's comment for why).
    friendly_events = fetch_todays_friendlies(teams)
    friendly_predictions = build_friendly_predictions(friendly_events, teams, teams_by_id, squad_ratings, data["elements"], all_transfer_events, manager_changes, tracking_since)
    friendly_logged_added, friendly_logged_total = log_friendly_predictions(friendly_predictions)
    print(f"data/friendly-predictions-log.json: {friendly_logged_added} new prediction(s) logged, {friendly_logged_total} total")
    friendly_resolved_added, friendly_resolved_total = resolve_friendly_predictions()
    print(f"data/friendly-predictions-log.json: {friendly_resolved_added} newly resolved, {friendly_resolved_total} total resolved")
    friendly_track_record = compute_friendly_track_record()

    eligible = [e for e in data["elements"] if float(e["selected_by_percent"] or 0) >= 2.0]
    percentiles = compute_percentiles(eligible)
    transfers_in_raw, transfers_out_raw = build_transfer_advice(eligible, fixture_swing, teams_by_id)

    # Captain picks: highest projected points next gameweek, must be
    # currently available (not injured/suspended).
    captain_pool = [e for e in eligible if e.get("status") == "a"]
    captain_picks = sorted(captain_pool, key=lambda e: float(e["ep_next"] or 0), reverse=True)[:3]

    # Top performers: highest cumulative points (last completed season).
    top_performers = sorted(eligible, key=lambda e: e["total_points"], reverse=True)[:6]

    leaderboards = build_leaderboards(eligible)

    price_risers, price_fallers = build_price_movement(eligible)

    stats_event = find_stats_event(data["events"])
    live_stats = {}
    if stats_event is not None:
        live_data = fetch_json(LIVE_EVENT_URL.format(event_id=stats_event["id"]))
        live_stats = {e["id"]: e["stats"] for e in live_data.get("elements", [])}
    gameweek_performers = build_gameweek_performers(eligible, live_stats)

    injury_report = build_injury_report(eligible)
    rotation_watch = build_rotation_watch(eligible)
    ownership_rising, ownership_falling = build_ownership_watch(eligible)

    deadline = datetime.fromisoformat(next_event["deadline_time"].replace("Z", "+00:00"))

    players_out = {}
    def register(e):
        p = build_player(e, teams, fixture_lookup, teams_by_id, percentiles)
        players_out[str(p["id"])] = p
        return str(p["id"])

    result = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": "Fantasy Premier League API (fantasy.premierleague.com)",
        "gameweek": {
            "name": next_event["name"],
            "deadlineISO": next_event["deadline_time"],
            "deadlineLabel": deadline.strftime("%a %d %b · %H:%M UTC"),
        },
        "captainPicks": [register(e) for e in captain_picks],
        "topPerformers": [register(e) for e in top_performers],
        "leaderboards": {label: [register(e) for e in players] for label, players in leaderboards.items()},
        # Full ~2%-owned-or-more pool, registered for the player comparison
        # tool - richer than the handful of players leaderboards need, but
        # still bounded to players with a real ownership footprint rather
        # than exposing all 500+ pros, most of whom nobody's tracking.
        "comparisonPool": [register(e) for e in sorted(eligible, key=lambda e: -e["total_points"])],
        "transferAdvice": {
            "in": [
                {"id": register(e), "reason": f"{teams[e['team']]}'s fixtures ease up over the next {SWING_WINDOW} gameweeks"}
                for e in transfers_in_raw
            ],
            "out": [
                {"id": register(e), "reason": f"{teams[e['team']]}'s fixtures get tougher over the next {SWING_WINDOW} gameweeks"}
                for e in transfers_out_raw
            ],
        },
        "wildcardWatch": wildcard_watch,
        "fixtures": fixtures_list,
        "predictionTrackRecord": prediction_track_record,
        "friendlyPredictions": friendly_predictions,
        "friendlyTrackRecord": friendly_track_record,
        "teams": teams_list,
        "players": players_out,
        # "Squad value" and "free transfers" are per-manager facts - the API
        # only has them for a specific manager's own team (entry/{id}), which
        # requires a real, logged-in FPL Team ID this app doesn't have yet
        # (that's the deferred accounts/sign-up work, not a data gap here).
        # Rather than keep showing a fabricated squad value, these two
        # front-end metric cards were repointed at real, always-available,
        # non-personal facts from the same bootstrap-static response:
        # total_players is FPL's own name for the global manager count
        # (despite the name, it's managers, not footballers - kept the
        # clearer name below), and len(elements) is the real number of
        # footballers in the game this season.
        "totalManagers": data["total_players"],
        "totalPlayers": len(data["elements"]),
        "priceMovement": {
            "risers": [{"id": register(e), "changeEvent": round(e["cost_change_event"] / 10, 1)} for e in price_risers],
            "fallers": [{"id": register(e), "changeEvent": round(e["cost_change_event"] / 10, 1)} for e in price_fallers],
        },
        "gameweekPerformers": {
            "eventName": stats_event["name"] if stats_event else None,
            "points": [{"id": register(e), "value": live_stats[e["id"]].get("total_points", 0)} for e in gameweek_performers["points"]],
            "goals": [{"id": register(e), "value": live_stats[e["id"]].get("goals_scored", 0)} for e in gameweek_performers["goals"]],
            "assists": [{"id": register(e), "value": live_stats[e["id"]].get("assists", 0)} for e in gameweek_performers["assists"]],
            "defensive": [{"id": register(e), "value": live_stats[e["id"]].get("defensive_contribution", 0)} for e in gameweek_performers["defensive"]],
            "bonus": [{"id": register(e), "value": live_stats[e["id"]].get("bonus", 0)} for e in gameweek_performers["bonus"]],
            "saves": [{"id": register(e), "value": live_stats[e["id"]].get("saves", 0)} for e in gameweek_performers["saves"]],
        },
        "injuryReport": [
            {
                "id": register(e),
                "status": e["status"],
                "news": e["news"],
                "chanceThisRound": this_chance,
                "chanceNextRound": next_chance,
                "improving": improving,
            }
            for e, this_chance, next_chance, improving in injury_report
        ],
        "rotationWatch": [{"id": register(e), "starts": starts, "minutes": e["minutes"]} for e, starts in rotation_watch],
        "ownershipWatch": {
            "rising": [{"id": register(e), "netTransfersEvent": net} for e, net in ownership_rising],
            "falling": [{"id": register(e), "netTransfersEvent": net} for e, net in ownership_falling],
        },
    }

    with open("data/fpl.json", "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)

    print(f"Wrote data/fpl.json - {len(players_out)} players, gameweek: {next_event['name']} ({result['gameweek']['deadlineLabel']})")


if __name__ == "__main__":
    main()
