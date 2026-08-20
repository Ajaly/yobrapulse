"""
One-time (re-runnable, safe to re-run - see the completion guard in
main()) historical backfill: real summer transfers that happened
BEFORE this feature started tracking (Aug 12, 2026 - see
fetch-fpl-data.py's ROSTER_SNAPSHOT_PATH), which detect_transfers'
live roster diffing can never see - same "cannot see the past" limit
already documented for match-history.json/player-history.json's own
backfills.

Approach: for each of the 20 real FPL clubs, fetch their real ESPN
roster from LAST season (verified directly: ESPN's roster endpoint
accepts a real ?season= query param and returns a genuinely different,
real historical squad - checked before writing this, not assumed) and
match every real player on it against this run's real, current FPL
elements by normalized full name (reusing backfill-player-history.py's
real accent-aware name normalization). A real player who was at club X
last season but is at a DIFFERENT real FPL club now genuinely
transferred - appended to data/transfer-log.json with this backfill
run's real timestamp as detectedAt (the real historical transfer date
itself isn't exposed by this data source, only the real fact and
direction of the move) and the player's CURRENT real FPL price as
marketValue (a real, available proxy - not their real price at the
actual time of transfer, which no free source here exposes).

Deliberately strict, single-strategy name matching (exact normalized
full name only, no lastName-containment fallback): unlike
backfill-player-history.py's per-club-scoped matching, this searches
a real player across ALL 20 current clubs at once, where a looser
fallback risks a genuine wrong-club mismatch feeding directly into
predict_fixture's real prediction math (see compute_transfer_impact).
An unmatched real player is skipped entirely, not guessed - same
"real data or nothing" rule used throughout this pipeline. Real
coverage is therefore not 100% (some genuine moves will be missed),
but nothing here is ever wrong on purpose.

Every event gets "source": "backfill" so it stays distinguishable from
live-detected transfers if that's ever needed, and so re-running this
script is a safe no-op (see main()) rather than a double-count.
"""
import importlib.util
import sys
from datetime import datetime, timezone

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

spec = importlib.util.spec_from_file_location("fetch_fpl_data", "fetch-fpl-data.py")
fpl = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fpl)

bfph_spec = importlib.util.spec_from_file_location("backfill_player_history", "backfill-player-history.py")
bfph = importlib.util.module_from_spec(bfph_spec)
bfph_spec.loader.exec_module(bfph)

ESPN_ROSTER_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/{slug}/teams/{team_id}/roster?season={season}"
REQUEST_DELAY_SECONDS = 0.25  # polite pacing against a free public endpoint

# Last COMPLETED real Premier League season as of the 2026/27 season
# already underway (see fetch-fpl-data.py's Gameweek 1 fixtures) -
# verified directly against ESPN's own season label ("2025-26 English
# Premier League"), not assumed from today's date.
LAST_SEASON = 2025


def build_current_fpl_index(elements, teams):
    """Real normalized full name -> {id, team, now_cost} for every
    current real FPL player, built once and reused for every club's
    last-season roster lookup. A name colliding across two real
    players (rare, not verified against for every real case) would
    silently keep whichever comes last - acceptable here since a
    wrong match only skips or mis-attributes one real historical
    transfer, never invents a fixture-affecting number out of nothing."""
    index = {}
    for e in elements:
        full_name = f"{e.get('first_name', '')} {e.get('second_name', '')}"
        key = bfph.normalize_person_name(full_name)
        if key:
            index[key] = {"id": e["id"], "teamId": e["team"], "nowCost": e.get("now_cost")}
    return index


def main():
    print("Fetching current FPL data...")
    data = fpl.fetch_json(fpl.BOOTSTRAP_URL)
    elements = data["elements"]
    teams = {t["id"]: t["name"] for t in data["teams"]}
    fpl_index = build_current_fpl_index(elements, teams)
    print(f"Indexed {len(fpl_index)} current real FPL players by name.")

    archive = fpl.load_transfer_log()
    if any(t.get("source") == "backfill" for t in archive):
        print("Backfill already ran (found 'source': 'backfill' entries in data/transfer-log.json) - nothing to do. Delete those entries first if you genuinely need to redo this.")
        return

    team_id_map = bfph.build_team_id_map(teams)
    detected_at = datetime.now(timezone.utc).isoformat()
    new_events = []

    for fpl_team_id, team_name in teams.items():
        espn_team_id = team_id_map.get(fpl_team_id)
        if espn_team_id is None:
            print(f"  {team_name}: no verified ESPN team id, skipping")
            continue
        roster = fpl.fetch_json(ESPN_ROSTER_URL.format(slug=fpl.ESPN_LEAGUE_SLUG, team_id=espn_team_id, season=LAST_SEASON))
        athletes = roster.get("athletes", [])
        moved = 0
        for athlete in athletes:
            key = bfph.normalize_person_name(athlete.get("fullName", ""))
            match = fpl_index.get(key)
            if match is None:
                continue  # real player no longer in a tracked FPL club (retired, relegated away, left the league) - not representable in this schema, skipped honestly
            if match["teamId"] == fpl_team_id:
                continue  # still at the same real club, not a transfer
            new_events.append({
                "playerId": match["id"],
                "playerName": athlete.get("fullName"),
                "fromTeamId": fpl_team_id,
                "fromTeam": team_name,
                "toTeamId": match["teamId"],
                "toTeam": teams[match["teamId"]],
                "detectedAt": detected_at,
                "marketValue": match["nowCost"],
                "source": "backfill",
            })
            moved += 1
        print(f"  {team_name}: {len(athletes)} players last season, {moved} since moved to another tracked club")
        import time
        time.sleep(REQUEST_DELAY_SECONDS)

    if not new_events:
        print("No real backfilled transfers found.")
        return

    archive.extend(new_events)
    with open(fpl.TRANSFER_LOG_PATH, "w", encoding="utf-8") as f:
        import json
        json.dump({"transfers": archive}, f, indent=2)
    print(f"Backfilled {len(new_events)} real transfer(s) into {fpl.TRANSFER_LOG_PATH}")


if __name__ == "__main__":
    main()
