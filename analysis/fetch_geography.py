"""Refresh versioned geography. Run explicitly; the normal pipeline is offline."""
import json
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCES = {
    'stations_source.csv': 'https://raw.githubusercontent.com/Osakwe1/TFL_Stations/master/data/Geodata/Stations_20220221.csv',
    'thames.geojson': 'https://gis.london.gov.uk/arcgis/rest/services/apps/webmap_context_layer/FeatureServer/1/query?' + urllib.parse.urlencode({'where':'1=1','outFields':'*','outSR':'4326','f':'geojson','maxAllowableOffset':'.00015'}),
    'london.geojson': 'https://gis.london.gov.uk/arcgis/rest/services/apps/webmap_context_layer/MapServer/0/query?' + urllib.parse.urlencode({'where':'1=1','outFields':'*','outSR':'4326','f':'geojson','maxAllowableOffset':'.0005'}),
}

if __name__ == '__main__':
    target = ROOT/'data/external'
    target.mkdir(parents=True, exist_ok=True)
    for filename, url in SOURCES.items():
        data = urllib.request.urlopen(url, timeout=60).read()
        if filename.endswith('geojson'):
            parsed = json.loads(data)
            if not parsed.get('features'):
                raise ValueError(f'Invalid geometry: {filename}')
            for f in parsed['features']:
                f['properties'] = {}  # No unused provider fields in browser output.
            data = json.dumps(parsed, separators=(',', ':')).encode()
            (ROOT/'public/data'/filename).write_bytes(data)
        (target/filename).write_bytes(data)
        print(filename, len(data), 'bytes')
    (target/'sources.json').write_text(json.dumps(SOURCES, indent=2), encoding='utf8')
