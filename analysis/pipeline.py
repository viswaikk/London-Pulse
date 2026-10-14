"""Clean NUMBAT in Python and export a compact, audited browser data contract.

Run from the repository root: python -m analysis.pipeline
No network access is needed: reference geography is versioned under data/external.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
PERIODS = [f'{(300+i*15)%1440//60:02d}{(300+i*15)%60:02d}-{(315+i*15)%1440//60:02d}{(315+i*15)%60:02d}' for i in range(96)]
KEYS = {'Link_Loads': 'Link', 'Link_Frequencies': 'Link', 'Line_Boarders': 'Line Code',
        'Station_Flows': 'ID', 'Station_Entries': 'NLC', 'Station_Exits': 'NLC',
        'Station_Boarders': 'ID', 'Station_Alighters': 'ID'}
COLORS = {'BAK': '#d49a65', 'CEN': '#ff595e', 'DIS': '#4ece8a', 'HAM': '#efabc5',
          'JUB': '#c1cbd6', 'MET': '#ce5290', 'NOR': '#98a3b5', 'PIC': '#6291ff',
          'VIC': '#44d5ff', 'WAC': '#94dfcf', 'DLR': '#29d6be', 'EZL': '#b99aff',
          'WAG': '#cc578c', 'ELL': '#ff786b', 'GOB': '#82cf53', 'NLL': '#65b5ef',
          'URL': '#c3c6c9', 'WEL': '#f3c548', 'TRM': '#8cce69'}


def clean_sheet(frame: pd.DataFrame, name: str) -> tuple[pd.DataFrame, dict]:
    """Remove formatting-only rows and the explicit TOTAL, never impute demand."""
    original = len(frame)
    frame = frame.dropna(how='all').dropna(axis=1, how='all').copy()
    totals = 0
    if name == 'Line_Boarders':
        total_mask = frame['Line Code'].eq('TfL') | frame['Line Name'].eq('TOTAL')
        totals = int(total_mask.sum())
        frame = frame.loc[~total_mask].copy()
    for col in frame.select_dtypes(include=['object', 'str']).columns:
        frame[col] = frame[col].map(lambda x: x.strip() if isinstance(x, str) else x)
    actual = [c for c in frame.columns if re.fullmatch(r'\d{4}-\d{4}', str(c))]
    if actual != PERIODS:
        raise ValueError(f'{name}: unexpected traffic-day columns')
    duplicates = int(frame[KEYS[name]].duplicated().sum())
    exact_duplicates = int(frame.duplicated().sum())
    # Boarding and alighting IDs describe platforms shared by multiple lines.
    # Their proper key is (ID, Line). Station_Flows has genuine ambiguous IDs.
    platform = name in ['Station_Boarders', 'Station_Alighters']
    logical_duplicates = int(frame.duplicated(['ID', 'Line']).sum()) if platform else duplicates
    if frame[KEYS[name]].isna().any() or (logical_duplicates and name != 'Station_Flows'):
        raise ValueError(f'{name}: missing or duplicate primary keys')
    if name == 'Station_Flows' or platform:
        frame.insert(0, 'source_excel_row', frame.index + 4)
    numeric = ['Total', 'Early', 'AM Peak', 'Midday', 'PM Peak', 'Evening', 'Late', *PERIODS]
    for col in numeric:
        frame[col] = pd.to_numeric(frame[col], errors='raise')
    values = frame[numeric].to_numpy(dtype=float)
    if not np.isfinite(values).all() or (values < 0).any():
        raise ValueError(f'{name}: missing, negative or non-finite demand')
    residual = (frame[PERIODS].sum(axis=1) - frame['Total']).abs()
    if (residual > 1e-5).any():
        raise ValueError(f'{name}: daily totals do not reconcile to intervals')
    return frame, {'source_rows': original, 'clean_rows': len(frame),
                   'formatting_rows_removed': original-len(frame)-totals,
                   'aggregate_rows_removed': totals, 'duplicate_keys': duplicates,
                   'logical_duplicate_keys': logical_duplicates,
                   'key_definition': 'ID + Line' if platform else KEYS[name],
                   'exact_duplicate_rows': exact_duplicates,
                   'used_in_app': name in ['Link_Loads', 'Line_Boarders', 'Station_Entries', 'Station_Exits'],
                   'missing_numeric_values': 0, 'negative_values': 0,
                   'zero_total_rows': int(frame.Total.eq(0).sum()),
                   'maximum_total_residual': float(residual.max())}


def prepare_geography(source: Path, entries: pd.DataFrame) -> pd.DataFrame:
    geo = pd.read_csv(source)
    # The source mistakenly repeats Hayes & Harlington's 3186 for Headstone Lane.
    geo.loc[geo.NAME.eq('Headstone Lane'), 'NLC'] = 1434
    geo['coordinate_method'] = 'reference NLC match'
    # Separate EL gateline record at the same station complex. A disclosed proxy,
    # not a claim that the EL entrance shares the exact surveyed DLR coordinate.
    custom = geo.loc[geo.NLC.eq(887)].copy()
    custom['NLC'] = 6561
    custom['NAME'] = 'Custom House EL'
    custom['coordinate_method'] = 'Custom House DLR complex proxy'
    geo = pd.concat([geo, custom], ignore_index=True)
    if geo.NLC.duplicated().any():
        raise ValueError('Ambiguous geography join')
    merged = entries[['NLC', 'ASC', 'Station', 'Fare Zone']].merge(
        geo[['NLC', 'x', 'y', 'coordinate_method']], on='NLC', how='left', validate='one_to_one')
    if merged[['x', 'y']].isna().any().any():
        raise ValueError('Unmatched station coordinates: ' + str(merged[merged.x.isna()].Station.tolist()))
    if not merged.x.between(-1.5, .5).all() or not merged.y.between(51.2, 51.9).all():
        raise ValueError('Coordinates outside expected network extent')
    return merged


def vector(row: pd.Series) -> list[float]:
    return np.round(row[PERIODS].to_numpy(dtype=float), 3).tolist()


def run(source: Path = ROOT / 'data/raw/NBT25TWT_Outputs.xlsx', root: Path = ROOT) -> dict:
    processed = root / 'data/processed'
    public = root / 'public/data'
    reports = root / 'reports'
    for p in (processed, public, reports):
        p.mkdir(parents=True, exist_ok=True)
    # A single Excel parse; row 3 contains the true column names.
    sheets = pd.read_excel(source, sheet_name=list(KEYS), header=2)
    tables, audit = {}, {}
    for name, frame in sheets.items():
        tables[name], audit[name] = clean_sheet(frame, name)
        tables[name].to_csv(processed / f'{name.lower()}.csv.gz', index=False, compression={'method': 'gzip', 'mtime': 0})
    entries = tables['Station_Entries'].set_index('NLC', drop=False)
    exits = tables['Station_Exits'].set_index('NLC', drop=False)
    if set(entries.index) != set(exits.index):
        raise ValueError('Entries/exits station coverage differs')
    geo = prepare_geography(root/'data/external/stations_source.csv', tables['Station_Entries'])
    geo.to_csv(processed/'station_locations.csv', index=False)
    line_table = tables['Line_Boarders']
    names = dict(zip(line_table['Line Name'], line_table['Line Code']))
    boarders = tables['Station_Boarders'].groupby('NLC')[['Total', *PERIODS]].sum()
    # Independent sheet-level reconciliation catches accidental TOTAL duplication.
    if not np.isclose(boarders.Total.sum(), line_table.Total.sum(), atol=.001, rtol=0):
        raise ValueError('Station and line boarding totals differ')
    links = []
    membership = {int(n): set() for n in entries.index}
    for _, row in tables['Link_Loads'].iterrows():
        code = names[row['Line']]
        a, b = int(row['From NLC']), int(row['To NLC'])
        membership[a].add(code)
        membership[b].add(code)
        links.append({'id': row.Link, 'line': code, 'from': a, 'to': b,
                      'direction': row.Dir, 'total': round(float(row.Total), 3), 'values': vector(row)})
    stations = []
    for _, loc in geo.iterrows():
        n = int(loc.NLC)
        ent, ext = entries.loc[n], exits.loc[n]
        stations.append({'id': n, 'code': loc.ASC, 'name': loc.Station, 'zone': str(loc['Fare Zone']),
                         'lon': float(loc.x), 'lat': float(loc.y), 'coordinateMethod': loc.coordinate_method,
                         'lines': sorted(membership[n]), 'entries': vector(ent), 'exits': vector(ext),
                         'dailyEntries': round(float(ent.Total), 3), 'dailyExits': round(float(ext.Total), 3)})
    lines = [{'id': r['Line Code'], 'name': r['Line Name'].replace('LO ', ''), 'mode': r.Mode,
              'color': COLORS[r['Line Code']], 'total': round(float(r.Total), 3), 'boarders': vector(r)}
             for _, r in line_table.iterrows()]
    total_entries = entries[PERIODS].sum()
    total_exits = exits[PERIODS].sum()
    peak = int(np.argmax(total_entries.to_numpy()))
    active = int(entries.Total.gt(0).sum())
    summary = {'dailyEntries': float(entries.Total.sum()), 'dailyExits': float(exits.Total.sum()),
               'dailyBoardings': float(line_table.Total.sum()), 'stationCount': len(entries),
               'activeStations': active, 'zeroDemandStations': int(entries.Total.eq(0).sum()),
               'directedLinks': len(links), 'activeLines': int(line_table.Total.gt(0).sum()),
               'peakEntryInterval': PERIODS[peak], 'peakEntries': float(total_entries.iloc[peak]),
               'topStations': [{'name': r.Station, 'entries': float(r.Total)} for _, r in entries.nlargest(10, 'Total').iterrows()],
               'entriesByTime': np.round(total_entries, 3).tolist(), 'exitsByTime': np.round(total_exits, 3).tolist()}
    metadata = {'title': 'London Pulse', 'year': 2025, 'dayType': 'Typical autumn Tuesday–Thursday',
                'dayTypeBasis': 'TWT workbook filename convention', 'sourceFile': source.name,
                'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
                'sourceUrl': 'https://crowding.data.tfl.gov.uk/', 'trafficDay': '05:00–04:59 next day',
                'intervalMinutes': 15, 'units': 'Estimated passengers per 15-minute interval',
                'coordinateSource': 'https://github.com/Osakwe1/TFL_Stations',
                'caveats': ['A representative autumn day, not a live feed or annual count.',
                    'Particles encode relative directional link demand; they are not individual passengers or trains.',
                    'Links connect geographic station coordinates; paths are not surveyed track alignments.',
                    'Network link sums count passenger-segments, not unique journeys.',
                    '39 zero-total Tram records are retained in the data and excluded from the active rail map.',
                    'Custom House EL uses the DLR station-complex coordinate as a disclosed proxy.']}
    payload = {'meta': metadata, 'intervals': PERIODS, 'stations': stations, 'links': links, 'lines': lines, 'summary': summary}
    (public/'network.json').write_text(json.dumps(payload, separators=(',', ':'), allow_nan=False), encoding='utf8')
    (reports/'quality_report.json').write_text(json.dumps({'source': metadata, 'sheets': audit,
        'geography': {'matched': len(geo), 'unmatched': 0, 'explicitCodeCorrections': 1, 'complexProxies': 1},
        'summary': summary}, indent=2, allow_nan=False), encoding='utf8')
    entry_long = tables['Station_Entries'].melt(id_vars=['NLC', 'ASC', 'Station', 'Fare Zone'],
        value_vars=PERIODS, var_name='interval', value_name='entries')
    exit_long = tables['Station_Exits'].melt(id_vars=['NLC'], value_vars=PERIODS, var_name='interval', value_name='exits')
    tidy = entry_long.merge(exit_long, on=['NLC', 'interval'], validate='one_to_one')
    tidy['interval_index'] = tidy.interval.map({p: i for i, p in enumerate(PERIODS)})
    tidy['minutes_since_traffic_day_start'] = tidy.interval_index * 15
    tidy['next_calendar_day'] = tidy.interval_index >= 76
    tidy.to_csv(processed/'station_demand_tidy.csv.gz', index=False, compression={'method': 'gzip', 'mtime': 0})
    print(json.dumps({k: v for k, v in summary.items() if k not in ['entriesByTime','exitsByTime','topStations']}, indent=2))
    return payload


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=ROOT/'data/raw/NBT25TWT_Outputs.xlsx')
    args = parser.parse_args()
    run(args.source)
