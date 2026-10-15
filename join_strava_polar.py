import pandas as pd
import geopandas as gpd
from pathlib import Path

DATA_FOLDER = Path(__file__).parent / "data"


# %% load data
dfs = pd.read_csv(DATA_FOLDER / "strava_trainings.csv", index_col=0)
dfp = pd.read_csv(DATA_FOLDER / "polar_trainings.csv")


# %% rename and align column names
dfp.rename(
    columns={
        "kilo_calories": "kcalories",
        "average_heart_rate": "avg_hr",
        "max_heart_rate": "max_hr",
    },
    inplace=True,
)
dfp["sport"] = dfp["sport"].replace({"OTHER_INDOOR": "WEIGHT_TRAINING"})

# %%

dfs.rename(
    columns={
        "Activity Name": "name",
        "Activity Type": "sport",
        "date_parsed": "date",
        "Distance": "distance",
        "duration_hours": "duration",
        "Calories": "kcalories",
        "Average Heart Rate": "avg_hr",
        "Max Heart Rate": "max_hr",
        "Max Watts": "max_watts",
        "Average Watts": "avg_watts",
        "Intensity": "intensity",
    },
    inplace=True,
)
# filter columns that we don't use
dfs = dfs[
    [
        "name",
        "sport",
        "date",
        "distance",
        "duration",
        "kcalories",
        "avg_hr",
        "max_hr",
        "max_watts",
        "avg_watts",
        "intensity",
    ]
]

# Strava export times are UTC; Polar startTime is local wall time. Use the
# Netherlands calendar day for this history (including daylight saving time).
# Polar CSVs do not retain per-session timezone offsets, so travel near midnight
# needs checking before treating these count-based candidates as duplicates.
dfs["date"] = (
    pd.to_datetime(dfs["date"], format="mixed", utc=True)
    .dt.tz_convert("Europe/Amsterdam")
    .dt.tz_localize(None)
)
dfp["date"] = pd.to_datetime(dfp["date"], format="mixed")

# %%
# check overlapping period of activities in a plot
import plotly.graph_objects as go
from plotfunctions import (
    PRIMARY,
    SECONDARY,
    SITE_PRISM_SLATE,
    SPORT_COLORS,
    SITE_HEADER,
    SITE_AXIS,
    style_figure,
    save_plot_json,
)


# Compare calendar-month coverage, not matched activities: months with records
# in both exports identify where we will need to check for duplicates.
monthly_counts = pd.concat(
    {
        source: pd.to_datetime(frame["date"], format="mixed")
        .dt.to_period("M")
        .value_counts()
        for source, frame in {"Polar": dfp, "Strava": dfs}.items()
    },
    axis=1,
).sort_index()
monthly_counts = monthly_counts.reindex(
    pd.period_range(monthly_counts.index.min(), monthly_counts.index.max(), freq="M")
).fillna(0)

coverage_figure = go.Figure()
for source, color in [("Polar", PRIMARY), ("Strava", SECONDARY)]:
    coverage_figure.add_trace(
        go.Scatter(
            x=monthly_counts.index.to_timestamp(),
            y=monthly_counts[source],
            name=source,
            mode="lines",
            line=dict(color=color, width=2.5),
            fill="tozeroy",
            fillcolor="rgba({},{},{},0.25)".format(
                *(int(color[i : i + 2], 16) for i in (1, 3, 5))
            ),
            hovertemplate="%{y:.0f} activities<extra>%{fullData.name}</extra>",
        )
    )

style_figure(
    coverage_figure, title="Activity coverage · Polar & Strava", show_legend=True
)
coverage_figure.update_layout(hovermode="x unified", legend=dict(entrywidth=0.3))
coverage_figure.update_xaxes(tickformat="%Y", dtick="M12", hoverformat="%B %Y")
coverage_figure.update_yaxes(title_text="Activities per month", rangemode="tozero")
coverage_figure.show()
save_plot_json(coverage_figure, name="polar-strava-activity-overlap")

# %% inspect possible double recordings by date, sport and elapsed duration
from plotly.subplots import make_subplots

sport_groups = {
    "ROWING": "Rowing",
    "INDOOR_ROWING": "Rowing",
    "Rowing": "Rowing",
    "CYCLING": "Cycling",
    "INDOOR_CYCLING": "Cycling",
    "Ride": "Cycling",
    "RUNNING": "Running",
    "Run": "Running",
    "SWIMMING": "Swimming",
    "Swim": "Swimming",
    "STRENGTH_TRAINING": "Weight training",
    "WEIGHT_TRAINING": "Weight training",
    "Weight Training": "Weight training",
    "HIKING": "Hiking",
    "OTHER_INDOOR": "Weight training",
    "OTHER_OUTDOOR": "Other",
    "OTHER": "Other",
}
activities = pd.concat(
    [dfp.assign(source="Polar"), dfs.assign(source="Strava")], ignore_index=True
)
activities["date"] = pd.to_datetime(activities["date"], format="mixed")
activities = activities.loc[
    activities["date"].ge("2017-01-01") & activities["date"].lt("2024-01-01")
].copy()
activities["sport_group"] = (
    activities["sport"].map(sport_groups).fillna(activities["sport"])
)
activities["duration_minutes"] = pd.to_numeric(activities["duration"]) * 60
sports = [
    sport
    for sport in dict.fromkeys(sport_groups.values())
    if sport in activities["sport_group"].unique()
]
sports += sorted(set(activities["sport_group"]) - set(sports))

comparison = make_subplots(
    rows=len(sports),
    cols=1,
    shared_xaxes=True,
    subplot_titles=sports,
    vertical_spacing=0.035,
)
for row, sport in enumerate(sports, start=1):
    for source, color, symbol, size in [
        ("Polar", PRIMARY, "circle-open", 10),
        ("Strava", SECONDARY, "x", 6),
    ]:
        subset = activities.loc[
            activities["sport_group"].eq(sport) & activities["source"].eq(source)
        ].sort_values("date")
        comparison.add_trace(
            go.Scatter(
                x=subset["date"],
                y=subset["duration_minutes"],
                mode="markers",
                name=source,
                legendgroup=source,
                showlegend=row == 1,
                marker=dict(
                    color=color, symbol=symbol, size=size, line=dict(width=1.5)
                ),
                customdata=subset[["sport", "distance", "name"]].fillna("").to_numpy(),
                hovertemplate=(
                    "%{x|%d %b %Y, %H:%M:%S}<br>"
                    "%{y:.1f} min · %{customdata[1]} km<br>"
                    "%{customdata[0]}<br>%{customdata[2]}<extra>%{fullData.name}</extra>"
                ),
            ),
            row=row,
            col=1,
        )

# Keep duration scales fixed across years for comparison. Proximity is a
# candidate signal, not proof of a match, even after aligning calendar times.
year_buttons = []
for year in range(2017, 2024):
    axis_ranges = {
        f"xaxis{row if row > 1 else ''}.range": [f"{year}-01-01", f"{year + 1}-01-01"]
        for row in range(1, len(sports) + 1)
    }
    year_buttons.append(dict(label=str(year), method="relayout", args=[axis_ranges]))

style_figure(
    comparison, title="Possible double recordings · Polar & Strava", show_legend=True
)
comparison.update_layout(
    height=220 * len(sports),
    margin=dict(t=150, b=110),
    legend=dict(y=-0.06, entrywidth=0.3),
    updatemenus=[dict(buttons=year_buttons, active=0, x=1, xanchor="right", y=1.065)],
)
comparison.update_xaxes(
    range=["2017-01-01", "2018-01-01"], dtick="M1", tickformat="%b", showticklabels=True
)
comparison.update_yaxes(title_text="Duration (min)", rangemode="tozero")
comparison.add_annotation(
    text="Choose a year · Nearby circles and crosses suggest possible duplicates; hover to compare details.",
    x=0,
    y=1.065,
    xref="paper",
    yref="paper",
    showarrow=False,
    xanchor="left",
)
comparison.show()
save_plot_json(comparison, name="polar-strava-activity-comparison")

# %% daily sport-count reconciliation for the proposed merge
OVERLAP_START = pd.Timestamp("2017-05-01")
OVERLAP_END = pd.Timestamp("2023-07-01")  # June 2023 is included

# Keep the boundary selections separate from the overlap investigation. Within
# the overlap, equal daily sport counts favour Strava; unequal counts require
# activity-level matching before selecting which Polar rows to retain.
polar_before_overlap = dfp.loc[dfp["date"] < OVERLAP_START].copy()
strava_after_overlap = dfs.loc[dfs["date"] >= OVERLAP_END].copy()
overlap = activities.loc[
    activities["date"].ge(OVERLAP_START) & activities["date"].lt(OVERLAP_END)
].copy()
overlap["day"] = overlap["date"].dt.normalize()
daily_counts = (
    overlap.groupby(["day", "sport_group", "source"])
    .size()
    .unstack("source", fill_value=0)
    .reindex(columns=["Polar", "Strava"], fill_value=0)
)
daily_counts["matched"] = daily_counts[["Polar", "Strava"]].min(axis=1)
daily_counts["strava_extra"] = daily_counts["Strava"] - daily_counts["matched"]
daily_counts["polar_extra"] = daily_counts["Polar"] - daily_counts["matched"]
daily_counts["equal_counts"] = daily_counts["Polar"].eq(daily_counts["Strava"])
daily_counts["month"] = daily_counts.index.get_level_values("day").to_period("M")

count_columns = ["Polar", "Strava", "matched", "strava_extra", "polar_extra"]
monthly_sport_counts = daily_counts.groupby(["month", "sport_group"])[
    count_columns
].sum()
sport_summary = daily_counts.groupby("sport_group")[count_columns].sum()
print("Daily sport-count comparison, May 2017–June 2023 (provisional matches):")
print(sport_summary.to_string())
daily_counts.to_csv(DATA_FOLDER / "polar_strava_daily_counts.csv")
sport_summary.to_csv(DATA_FOLDER / "polar_strava_overlap_summary.csv")

months = pd.period_range(OVERLAP_START, OVERLAP_END - pd.Timedelta(days=1), freq="M")
month_labels = months.strftime("%Y-%m").tolist()
month_positions = []
year_positions = {}
row_position = 0
for month in months:
    if month.year not in year_positions:
        year_positions[month.year] = row_position
        row_position += 1  # a blank bar row for the year heading
    month_positions.append(row_position)
    row_position += 1
matched_per_month = (
    monthly_sport_counts.groupby("month")["matched"].sum().reindex(months, fill_value=0)
)
reconciliation = go.Figure()
reconciliation.add_trace(
    go.Bar(
        x=matched_per_month,
        base=-matched_per_month / 2,
        y=month_positions,
        customdata=month_labels,
        orientation="h",
        width=0.75,
        name="Matched count",
        marker_color="#64748b",
        hovertemplate="%{customdata}<br>%{x} matched by daily sport count<extra></extra>",
    )
)
# Explicit bases let each month's matched segment float around zero. Surplus
# segments extend from its edges; negative widths represent Strava on the left.
left_edge = -matched_per_month / 2
right_edge = matched_per_month / 2
for sport in sports:
    if sport not in monthly_sport_counts.index.get_level_values("sport_group"):
        continue
    for source, extra_column, direction in [
        ("Strava", "strava_extra", -1),
        ("Polar", "polar_extra", 1),
    ]:
        counts = monthly_sport_counts.xs(sport, level="sport_group")[
            extra_column
        ].reindex(months, fill_value=0)
        reconciliation.add_trace(
            go.Bar(
                x=direction * counts,
                base=left_edge if direction == -1 else right_edge,
                y=month_positions,
                orientation="h",
                width=0.75,
                customdata=list(zip(month_labels, counts)),
                name=sport,
                legendgroup=sport,
                showlegend=source == "Strava",
                marker_color=SPORT_COLORS[sport],
                hovertemplate="%{customdata[0]}<br>%{customdata[1]} surplus "
                + sport.lower()
                + " activities<extra>"
                + source
                + "</extra>",
            )
        )
        if direction == -1:
            left_edge = left_edge - counts
        else:
            right_edge = right_edge + counts

style_figure(reconciliation, title="Shared training history", show_legend=True)
reconciliation.update_layout(
    barmode="overlay",
    height=2200,
    margin=dict(t=250, b=30, l=85, r=55),
    title=dict(
        y=0.985,
        subtitle=dict(text="May 2017–June 2023", font=dict(size=17, color=SITE_AXIS)),
    ),
    legend=dict(
        y=1.075,
        yanchor="top",
        x=0.5,
        xanchor="center",
        entrywidth=0.24,
        bgcolor="rgba(0,0,0,0)",
        borderwidth=0,
    ),
)
reconciliation.update_yaxes(
    type="linear",
    range=[row_position - 0.25, -0.75],
    tickmode="array",
    tickvals=month_positions,
    ticktext=[month.strftime("%b").lower() for month in months],
    ticks="",
    tickfont=dict(color=SITE_AXIS, size=12),
    showline=False,
    showgrid=False,
    zeroline=False,
)
span = max(abs(left_edge.min()), right_edge.max())
reconciliation.update_xaxes(visible=False, range=[-span * 1.15, span * 1.15])
for x, label in [(0.37, "← Strava surplus"), (0.63, "Polar surplus →")]:
    reconciliation.add_annotation(
        text=label,
        x=x,
        y=1.018,
        xref="paper",
        yref="paper",
        showarrow=False,
        xanchor="center",
        font=dict(size=13, color=SITE_HEADER),
    )
for year, position in year_positions.items():
    reconciliation.add_annotation(
        text=f"<b>{year}</b>",
        x=0,
        y=position,
        xref="x",
        yref="y",
        xanchor="center",
        showarrow=False,
        font=dict(family="Josefin Sans, sans-serif", size=17, color=SITE_HEADER),
    )
monthly_surplus = (
    monthly_sport_counts.groupby("month")[["strava_extra", "polar_extra"]]
    .sum()
    .reindex(months, fill_value=0)
)
for month, position in zip(months, month_positions):
    matched = int(matched_per_month.loc[month])
    # Small centres retain their hover count rather than squeezing in a label.
    if matched >= 4:
        reconciliation.add_annotation(
            x=0,
            y=position,
            text=str(matched),
            showarrow=False,
            font=dict(size=10, color=SITE_HEADER),
        )
    for column, edge, anchor, shift in [
        ("strava_extra", left_edge, "right", -6),
        ("polar_extra", right_edge, "left", 6),
    ]:
        surplus = int(monthly_surplus.loc[month, column])
        if surplus:
            reconciliation.add_annotation(
                x=float(edge.loc[month]),
                y=position,
                text=str(surplus),
                showarrow=False,
                xanchor=anchor,
                xshift=shift,
                font=dict(size=11, color=SITE_HEADER),
            )
reconciliation.show()
save_plot_json(reconciliation, name="polar-strava-monthly-reconciliation")

# %% consolidate using the agreed source boundaries
# Polar supplies all early history and rowing through June 2017. Strava
# supplies other sports from May 2017 and all sports from July 2017 onward.
# Select whole source slices rather than inferring individual duplicate pairs.
ROWING_HANDOVER = pd.Timestamp("2017-07-01")
polar_sport = dfp["sport"].map(sport_groups).fillna(dfp["sport"])
strava_sport = dfs["sport"].map(sport_groups).fillna(dfs["sport"])
keep_polar = dfp["date"].lt(OVERLAP_START) | (
    dfp["date"].ge(OVERLAP_START)
    & dfp["date"].lt(ROWING_HANDOVER)
    & polar_sport.eq("Rowing")
)
keep_strava = dfs["date"].ge(OVERLAP_START) & ~(
    dfs["date"].lt(ROWING_HANDOVER) & strava_sport.eq("Rowing")
)

consolidated_trainings = pd.concat(
    [
        dfp.loc[keep_polar].assign(source="Polar", source_row=dfp.index[keep_polar]),
        dfs.loc[keep_strava].assign(source="Strava", source_row=dfs.index[keep_strava]),
    ],
    ignore_index=True,
)
consolidated_trainings.rename(columns={"sport": "source_sport"}, inplace=True)
consolidated_trainings["sport"] = (
    consolidated_trainings["source_sport"]
    .map(sport_groups)
    .fillna(consolidated_trainings["source_sport"])
)
consolidated_trainings.sort_values("date", kind="stable", inplace=True)
consolidated_trainings.reset_index(drop=True, inplace=True)
consolidated_trainings.to_json(
    DATA_FOLDER / "consolidated_trainings.json",
    orient="records",
    date_format="iso",
    indent=2,
    force_ascii=False,
)
print("Consolidated activities by source:")
print(consolidated_trainings["source"].value_counts().to_string())

# %% show how retained Polar and Strava activities build the consolidated total
consolidated_source_counts = (
    consolidated_trainings.groupby(
        [consolidated_trainings["date"].dt.to_period("M"), "source"]
    )
    .size()
    .unstack("source", fill_value=0)
    .reindex(monthly_counts.index, fill_value=0)
    .reindex(columns=["Polar", "Strava"], fill_value=0)
    .sort_index()
)
consolidated_monthly_counts = consolidated_source_counts.sum(axis=1)
# Reuse the coverage styling, with only retained activities in the new traces.
consolidated_coverage_figure = go.Figure(layout=coverage_figure.layout)
for source, color in [("Polar", PRIMARY), ("Strava", SECONDARY)]:
    consolidated_coverage_figure.add_trace(
        go.Scatter(
            x=consolidated_source_counts.index.to_timestamp(),
            y=consolidated_source_counts[source],
            name=source,
            mode="lines",
            stackgroup="retained",
            line=dict(color=color, width=2),
            fillcolor="rgba({},{},{},0.4)".format(
                *(int(color[i : i + 2], 16) for i in (1, 3, 5))
            ),
            customdata=consolidated_monthly_counts,
            hovertemplate=(
                "%{y:.0f} retained activities<br>"
                "%{customdata:.0f} total that month<extra>%{fullData.name}</extra>"
            ),
        )
    )
style_figure(consolidated_coverage_figure, title="Activity coverage · Consolidated")
consolidated_coverage_figure.update_yaxes(title_text="Activities per month")
consolidated_coverage_figure.show()
save_plot_json(consolidated_coverage_figure, name="polar-strava-consolidated-coverage")
