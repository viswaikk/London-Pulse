"""Domain tests: traffic-day order, aggregation, provenance and geography joins."""
import unittest
import pandas as pd
import numpy as np
from analysis.pipeline import PERIODS, clean_sheet, prepare_geography, ROOT


def record(key='NLC', value=1):
    return {key: value, 'Total': 96., 'Early': 8., 'AM Peak': 12., 'Midday': 24.,
            'PM Peak': 12., 'Evening': 12., 'Late': 28., **{p: 1. for p in PERIODS}}


class PipelineTests(unittest.TestCase):
    def test_midnight_is_not_sorted_to_start(self):
        self.assertEqual(PERIODS[0], '0500-0515')
        self.assertEqual(PERIODS[75], '2345-0000')
        self.assertEqual(PERIODS[76], '0000-0015')
        self.assertEqual(PERIODS[-1], '0445-0500')
        self.assertEqual(len(set(PERIODS)), 96)

    def test_daily_total_cannot_double_count_aggregate(self):
        a = record('Line Code', 'VIC'); a['Line Name'] = 'Victoria'
        total = record('Line Code', 'TfL'); total['Line Name'] = 'TOTAL'
        cleaned, audit = clean_sheet(pd.DataFrame([a, total]), 'Line_Boarders')
        self.assertEqual(len(cleaned), 1)
        self.assertEqual(cleaned.Total.sum(), 96.)
        self.assertEqual(audit['aggregate_rows_removed'], 1)

    def test_true_zero_is_preserved(self):
        a = record(); a.update({p:0. for p in PERIODS}); a['Total']=0.
        frame, audit=clean_sheet(pd.DataFrame([a]), 'Station_Entries')
        self.assertEqual(len(frame),1);self.assertEqual(audit['zero_total_rows'],1)

    def test_missing_negative_and_infinite_demand_fail(self):
        for value in [np.nan, -1, np.inf]:
            a=record();a[PERIODS[0]]=value
            with self.assertRaises(ValueError):clean_sheet(pd.DataFrame([a]),'Station_Entries')

    def test_mismatched_daily_total_fails(self):
        a=record();a['Total']=200.
        with self.assertRaises(ValueError):clean_sheet(pd.DataFrame([a]),'Station_Entries')

    def test_shared_platform_requires_line_in_key(self):
        a=record('ID',1);a['Line']='HAM'
        b=record('ID',1);b['Line']='MET'
        f,audit=clean_sheet(pd.DataFrame([a,b]),'Station_Boarders')
        self.assertEqual(len(f),2);self.assertEqual(audit['logical_duplicate_keys'],0)
        with self.assertRaises(ValueError):clean_sheet(pd.DataFrame([a,a]),'Station_Boarders')

    def test_ambiguous_flows_keep_excel_provenance(self):
        a=record('ID','1>2')
        f,audit=clean_sheet(pd.DataFrame([a,a]),'Station_Flows')
        self.assertEqual(f.source_excel_row.tolist(),[4,5]);self.assertEqual(audit['duplicate_keys'],1)

    def test_geography_correction_does_not_move_hayes(self):
        sample=pd.DataFrame({'NLC':[1434,3186,6561], 'ASC':['HDLr','HAYr','CUSr'],
            'Station':['Headstone Lane','Hayes and Harlington','Custom House EL'],'Fare Zone':[5,5,3]})
        geo=prepare_geography(ROOT/'data/external/stations_source.csv',sample).set_index('NLC')
        self.assertGreater(geo.loc[1434,'y'],51.6)
        self.assertLess(geo.loc[3186,'y'],51.51)
        self.assertIn('proxy',geo.loc[6561,'coordinate_method'])


if __name__=='__main__':unittest.main()
