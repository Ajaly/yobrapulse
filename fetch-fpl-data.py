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

What's still deliberately NOT included: transfer/price-movement data
(transfers_in_event, cost_change_start, etc.) is genuinely flat/zero
this early in pre-season - that's a direct read of the API's own
numbers, not a guess, so "transfer advice" recommendations aren't
built from it. That panel stays as illustrative content in the front
end for now; revisit once the season is underway and this data starts
moving.

Match outcome predictions (see predict_fixture): checked what a real
prediction engine would need - historical head-to-head and
player-vs-specific-opponent stats aren't available from this API at
all (verified directly: a player's element-summary only keeps
season-level totals once a season ends, not fixture-by-fixture
history). Per-team attack/defence strength splits are also all zero
right now (not yet populated for the new season). What IS real and
usable: each team's overall home/away strength rating (the same
FPL-published figures that already drive fixture FDR) and real
last-season squad quality (the same squadRating used in the Teams
view). The model below is a transparent, documented heuristic built
from those two real signals - not a trained model, not head-to-head,
and it says so in the UI.
"""
import json
import urllib.request
from datetime import datetime, timezone

BOOTSTRAP_URL = "https://fantasy.premierleague.com/api/bootstrap-static/"
FIXTURES_URL = "https://fantasy.premierleague.com/api/fixtures/?event={event_id}"
HEADERS = {"User-Agent": "Mozilla/5.0"}

POSITIONS = {1: "GKP", 2: "DEF", 3: "MID", 4: "FWD"}
AVATAR_CLASSES = ["", "blue-avatar", "orange-avatar", "pink-avatar"]
CREST_CLASSES = ["", "blue-crest", "orange-crest", "pink-crest"]
FDR_CLASS = {1: "easy", 2: "easy", 3: "mid", 4: "hard", 5: "hard"}


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


def predict_fixture(home_team, away_team, squad_ratings):
    """Home/draw/away percentages (always sum to exactly 100) plus a
    predicted scoreline, from two real signals: FPL's own overall
    home/away strength rating per club, and real last-season squad
    quality (points-per-90). Base rates (45/25/30) reflect the actual
    long-run Premier League home-advantage split. No head-to-head, no
    current-season form (there isn't any yet) - documented above."""
    strength_diff = home_team["strength_overall_home"] - away_team["strength_overall_away"]
    home_quality = squad_ratings.get(home_team["id"])
    away_quality = squad_ratings.get(away_team["id"])
    # Neither side gets credit/blame for a rating neither team can be
    # trusted to have (see compute_squad_ratings) - fall back to
    # strength-only rather than silently treating "no data" as "zero".
    quality_diff = (home_quality - away_quality) if (home_quality is not None and away_quality is not None) else 0

    home_win = 45 + strength_diff * 7 + quality_diff * 5
    away_win = 30 - strength_diff * 6 - quality_diff * 4
    home_win = max(15, min(72, home_win))
    away_win = max(8, min(58, away_win))
    draw = 100 - home_win - away_win
    if draw < 10:
        deficit = 10 - draw
        scale = deficit / (home_win + away_win) if (home_win + away_win) else 0
        home_win -= home_win * scale
        away_win -= away_win * scale
        draw = 10

    home_win = round(home_win)
    draw = round(draw)
    away_win = 100 - home_win - draw  # exact after rounding

    edge = strength_diff * 0.15 + quality_diff * 0.1
    home_goals = max(0.4, min(3.8, 1.5 + edge))
    away_goals = max(0.3, min(3.2, 1.1 - edge * 0.8))

    return {
        "homeWinPct": home_win,
        "drawPct": draw,
        "awayWinPct": away_win,
        "predictedScore": f"{home_goals:.1f} — {away_goals:.1f}",
    }


def build_fixtures_list(fixtures, teams, teams_by_id, squad_ratings):
    out = []
    for f in sorted(fixtures, key=lambda x: x["kickoff_time"] or ""):
        if not f["kickoff_time"]:
            continue
        kickoff = datetime.fromisoformat(f["kickoff_time"].replace("Z", "+00:00"))
        entry = {
            "home": teams[f["team_h"]],
            "away": teams[f["team_a"]],
            "kickoffISO": f["kickoff_time"],
            "kickoffLabel": kickoff.strftime("%a %d %b · %H:%M UTC"),
        }
        entry.update(predict_fixture(teams_by_id[f["team_h"]], teams_by_id[f["team_a"]], squad_ratings))
        out.append(entry)
    return out


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
    return {"points": by_points, "assists": by_assists, "xg": by_xg, "value": by_value}


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

    next_event = next((ev for ev in data["events"] if ev.get("is_next")), data["events"][0])
    fixtures = fetch_json(FIXTURES_URL.format(event_id=next_event["id"]))
    fixture_lookup = build_fixture_lookup(fixtures, teams)
    fixtures_list = build_fixtures_list(fixtures, teams, teams_by_id, squad_ratings)
    teams_list = build_teams_list(data, squad_ratings)

    eligible = [e for e in data["elements"] if float(e["selected_by_percent"] or 0) >= 2.0]
    percentiles = compute_percentiles(eligible)

    # Captain picks: highest projected points next gameweek, must be
    # currently available (not injured/suspended).
    captain_pool = [e for e in eligible if e.get("status") == "a"]
    captain_picks = sorted(captain_pool, key=lambda e: float(e["ep_next"] or 0), reverse=True)[:3]

    # Top performers: highest cumulative points (last completed season).
    top_performers = sorted(eligible, key=lambda e: e["total_points"], reverse=True)[:6]

    leaderboards = build_leaderboards(eligible)

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
        "fixtures": fixtures_list,
        "teams": teams_list,
        "players": players_out,
    }

    with open("data/fpl.json", "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)

    print(f"Wrote data/fpl.json - {len(players_out)} players, gameweek: {next_event['name']} ({result['gameweek']['deadlineLabel']})")


if __name__ == "__main__":
    main()
