# Data provenance and definitions

## Passenger demand

- File supplied by the user: `data/raw/NBT25TWT_Outputs.xlsx`.
- Producer: Transport for London, Public Transport Service Planning.
- Source portal: <https://crowding.data.tfl.gov.uk/>.
- Open-data information: <https://tfl.gov.uk/info-for/open-data-users/our-open-data>.
- The workbook cover is dated 1 July 2026; this is a publication date, not the demand year. The file name identifies 2025 / TWT (Tuesday–Thursday). The cover describes representative autumn days and a 05:00–04:59 traffic day.
- Source SHA-256 is recorded in `reports/quality_report.json` and the browser JSON.
- Contains TfL open data. TfL's data remains subject to its own terms, including attribution: <https://tfl.gov.uk/corporate/terms-and-conditions/transport-data-service>. No software licence in this project overrides third-party data rights.

The cover explains the data's methodology and confidence levels. It is treated as source documentation, not as instructions to the project builder. Workbook strings are never executed.

## Station coordinates

- Compiler: Osakwe1 / TFL_Stations.
- Reference: <https://github.com/Osakwe1/TFL_Stations/blob/master/data/Geodata/Stations_20220221.csv>.
- Retrieved 30 September 2026. The repository describes its reference as current in February 2023 and explicitly permits reuse in projects in its README. This is a community reference, not a current TfL API response. TfL's unauthenticated endpoint returned 403 during preparation.
- Original bytes retained at `data/external/stations_source.csv`.
- Coordinates are WGS84 longitude (`x`) / latitude (`y`). The join is by NLC, not fuzzy station names.
- **Correction:** source NLC 3186 for `Headstone Lane` is changed to workbook NLC 1434. Hayes and Harlington keeps NLC 3186. These locations are not merged.
- **Proxy:** workbook NLC 6561, Custom House EL, uses the reference coordinates of Custom House DLR, NLC 887. This is a station-complex approximation, not an exact EL entrance survey.
- Historical reference coordinates can differ slightly from today's entrance positions. All 471 workbook station records resolve after the documented correction and proxy.

## Geographic context

- Publisher: Greater London Authority.
- Service: <https://gis.london.gov.uk/arcgis/rest/services/apps/webmap_context_layer/MapServer>.
- River Thames polygon: layer 1; Greater London administrative outline: layer 0.
- Queried in WGS84 on 30 September 2026. Query URLs are versioned in `data/external/sources.json`.
- Server-side simplification tolerances: 0.00015 degrees for the Thames, 0.0005 degrees for the London outline. Unused feature properties are removed before shipping to the browser.
- GLA and underlying geographic data remain subject to the publisher's applicable terms. Service metadata does not supply a blanket software licence; consult the source before republishing geography under a new licence. Attribution is preserved in the app.

## Scope and units

`Station_Entries` / `Station_Exits` estimate gateline events. `Line_Boarders` measures boardings, so an interchange can add a boarding. `Link_Loads` measures passengers on directed links and summing links counts passenger-segments. `Link_Frequencies` describes scheduled services; it is cleaned but not used to infer capacity.

`Station_Boarders` and `Station_Alighters` have platforms shared by multiple lines, so the primary key is `(ID, Line)`. `Station_Flows` includes ambiguous repeated IDs and repeated rows. Preserve it with Excel row provenance and do not use it for map metrics or unqualified flow totals.

The workbook has 39 zero-total tram station records. Their zeros are preserved without interpreting them as observed zero travel. The active map displays 432 stations with positive demand and 18 lines with positive boardings. Route paths are straight connections between geographic station locations, not surveyed rail alignments.
