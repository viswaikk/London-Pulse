"""Build the reproducible analytical figures and narrative (Python only)."""
from __future__ import annotations
import json
from pathlib import Path
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.ticker import FuncFormatter
from analysis.pipeline import ROOT, PERIODS, COLORS


def run(root: Path = ROOT) -> dict:
    out=root/'reports/figures';out.mkdir(parents=True,exist_ok=True)
    p=root/'data/processed'
    entries=pd.read_csv(p/'station_entries.csv.gz')
    exits=pd.read_csv(p/'station_exits.csv.gz')
    lines=pd.read_csv(p/'line_boarders.csv.gz')
    links=pd.read_csv(p/'link_loads.csv.gz')
    quality=json.loads((root/'reports/quality_report.json').read_text())
    plt.rcParams.update({'font.family':'DejaVu Sans','font.size':11,'axes.facecolor':'#101e24',
        'figure.facecolor':'#0b151a','text.color':'#deede8','axes.labelcolor':'#afc9c0',
        'xtick.color':'#91aaa2','ytick.color':'#b9cdc5','axes.edgecolor':'#2d4345',
        'savefig.facecolor':'#0b151a','axes.spines.top':False,'axes.spines.right':False})
    ent=entries[PERIODS].sum();ext=exits[PERIODS].sum()
    top=entries.nlargest(10,'Total').sort_values('Total')
    fig,axs=plt.subplots(1,2,figsize=(15,5.5),gridspec_kw={'width_ratios':[1.35,1]})
    ax=axs[0];ax.plot(range(96),ent,color='#90f2ce',lw=2,label='Entries');ax.plot(range(96),ext,color='#7fb8df',lw=1.6,label='Exits')
    ax.fill_between(range(96),ent,color='#90f2ce',alpha=.08)
    ax.set_xticks([0,16,32,48,64,80,95],['05:00','09:00','13:00','17:00','21:00','01:00 +1','04:45 +1'])
    ax.set_ylabel('Estimated passengers / 15 min');ax.set_title('The rhythm of the traffic day',loc='left',pad=18)
    ax.yaxis.set_major_formatter(FuncFormatter(lambda v,p:f'{v/1000:.0f}k'));ax.grid(axis='y',alpha=.1);ax.legend(frameon=False,labelcolor='#b9cdc5')
    ax=axs[1];ax.barh(top.Station,top.Total,color='#90f2ce',height=.65)
    ax.xaxis.set_major_formatter(FuncFormatter(lambda v,p:f'{v/1000:.0f}k'));ax.set_xlabel('Estimated entries / traffic day');ax.set_title('The busiest entry stations',loc='left',pad=18)
    fig.suptitle('LONDON PULSE / AUTUMN 2025 TUE–THU',x=.055,ha='left',fontsize=14,color='#90f2ce')
    fig.tight_layout(pad=2.4);fig.savefig(out/'demand_overview.png',dpi=170,bbox_inches='tight');plt.close(fig)
    active=lines[lines.Total>0].sort_values('Total',ascending=False)
    matrix=active[PERIODS].to_numpy()
    normalized=matrix/matrix.max(axis=1,keepdims=True)
    fig,ax=plt.subplots(figsize=(13,7));im=ax.imshow(normalized,aspect='auto',cmap='YlGnBu_r',vmin=0,vmax=1,interpolation='nearest')
    ax.set_yticks(range(len(active)),active['Line Name'].str.replace('LO ','',regex=False))
    ax.set_xticks([0,16,32,48,64,80,95],['05:00','09:00','13:00','17:00','21:00','01:00 +1','04:45 +1'])
    ax.set_title('Each line has its own daily rhythm',loc='left',pad=18,fontsize=17)
    cbar=fig.colorbar(im,ax=ax,shrink=.8);cbar.set_label('Quarter-hour boardings / own-line peak')
    fig.text(.02,.01,'Each row is normalized separately. Compare timing here, not absolute passenger volume.',color='#91aaa2',fontsize=10)
    fig.tight_layout(rect=[0,.025,1,1]);fig.savefig(out/'line_rhythms.png',dpi=170,bbox_inches='tight');plt.close(fig)
    balanced=entries[['NLC','Station','AM Peak','PM Peak']].merge(exits[['NLC','AM Peak','PM Peak']],on='NLC',suffixes=('_entries','_exits'),validate='one_to_one')
    balanced['am_net_entries']=balanced['AM Peak_entries']-balanced['AM Peak_exits']
    balanced['pm_net_entries']=balanced['PM Peak_entries']-balanced['PM Peak_exits']
    balanced.to_csv(root/'reports/station_peak_balance.csv',index=False)
    ranked=links.nlargest(10,'Total')[['Line','Dir','From Station','To Station','Total']]
    ranked.to_csv(root/'reports/top_directed_links.csv',index=False)
    active[['Mode','Line Code','Line Name','Total']].to_csv(root/'reports/line_daily_boardings.csv',index=False)
    top_share=entries.nlargest(10,'Total').Total.sum()/entries.Total.sum()
    am=ent.iloc[8:20].sum();pm=ent.iloc[44:56].sum()
    summary={'daily_entries':float(ent.sum()),'daily_exits':float(ext.sum()),
      'entry_exit_difference':float(ext.sum()-ent.sum()),'top10_entry_share':float(top_share),
      'peak_interval':PERIODS[int(ent.argmax())], 'peak_entries':float(ent.max()),
      'am_peak_entries_0700_1000':float(am),'pm_peak_entries_1600_1900':float(pm),
      'pm_to_am_ratio':float(pm/am), 'busiest_line':str(active.iloc[0]['Line Name'])}
    (root/'reports/eda_summary.json').write_text(json.dumps(summary,indent=2),encoding='utf8')
    flow_audit=quality['sheets']['Station_Flows']
    report=f'''# London Pulse: exploratory findings

Source: user-supplied `NBT25TWT_Outputs.xlsx`, TfL NUMBAT 2025. TWT denotes a typical autumn Tuesday–Thursday. Traffic day: 05:00 to 04:59 next day. Figures describe one representative day, not annual totals.

## Findings

- **{ent.sum():,.0f} estimated station entries** and **{ext.sum():,.0f} exits** across the traffic day. The {ext.sum()-ent.sum():,.0f} difference is preserved, not forced to balance; the source does not establish its cause.
- **{ent.max():,.0f} entries at {PERIODS[int(ent.argmax())]}**, the busiest quarter-hour.
- The ten busiest entry records account for **{top_share:.1%}** of entries. Station complexes with multiple NLCs remain separate.
- **{pm/am:.2f}×** as many entries in 16:00–19:00 as in 07:00–10:00.
- **{active.iloc[0]['Line Name']}** has the most daily line boardings. Boardings include transfers and are not the same as entries or unique journeys.
- **432 active rail stations**, plus **39 zero-total tram records** preserved in the clean tables. Do not interpret the tram zeros as evidence that no passengers travelled.

## Cleaning and quality

The workbook's first two rows are presentation headers. Python reads row 3, removes empty formatting rows and the explicit line TOTAL, validates 96 ordered intervals, preserves numeric precision, and checks non-negativity and daily reconciliation (absolute tolerance 0.00001).

Station entry/exit NLCs and directed link IDs are unique. Station boarding/alighting records use **(ID, Line)**: platforms shared by lines legitimately repeat their ID. `Station_Flows` has **{flow_audit['duplicate_keys']} repeated ID occurrences** and **{flow_audit['exact_duplicate_rows']} exact repeated rows** after trimming. These are retained with `source_excel_row`, reported as unresolved, and excluded from map metrics. No silent deduplication or demand imputation is performed.

All 471 station coordinates join after an explicit Headstone Lane code correction and one disclosed Custom House EL complex proxy. The reference's erroneous Headstone Lane 3186 is changed to 1434; Hayes & Harlington retains 3186 and its own location.

## Reading the figures

![Network demand and busiest stations](figures/demand_overview.png)

![Within-line demand timing](figures/line_rhythms.png)

The heatmap normalizes each line by its own maximum. It supports comparisons of timing, not line volume. The station-peak balance table measures entries minus exits; a negative number indicates more exits in that period, not an identified commuting purpose.

## Limitations

NUMBAT estimates route choices using ticketing and gateline data and assumes full scheduled service. Interchange paths are less certain than non-interchange flows. Link totals count passenger-segments and cannot be summed to unique journeys. No capacity utilisation, live train position, delay, individual itinerary, causal explanation or annual trend can be inferred from this workbook alone. The browser rounds demand to three decimals for payload size and to whole estimates for display; analysis retains original precision.

See `quality_report.json` for sheet-level checks and `DATA_PROVENANCE.md` at the repository root for external geographic sources.
'''
    (root/'reports/EDA.md').write_text(report,encoding='utf8')
    return summary


if __name__=='__main__':
    print(json.dumps(run(),indent=2))
