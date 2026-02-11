import pandas as pd
from pathlib import Path
from plotly import express as px

from plotfunctions import PLOT_TEMPLATE, SITE_PRISM_SLATE, style_figure

fp = Path(__file__).parent / "data" / "strava" / "activities.csv"


df = pd.read_csv(fp)

# %% parse some columns for plotting
df["date_parsed"] = pd.to_datetime(df["Activity Date"])
df["duration_hours"] = df["Elapsed Time"].apply(
    lambda x: pd.to_timedelta(x, unit="s").total_seconds() / 3600
)
# count the number of activities per type
activity_counts = (
    df["Activity Type"]
    .value_counts()
    .rename_axis("Activity Type")
    .reset_index(name="count")
)


def plot_bar(
    activity_counts: pd.DataFrame,
    title: str,
    x: str = "count",
    y: str = "Activity Type",
    suffix: str = "",
):
    fig = px.bar(
        activity_counts,
        x=x,
        y=y,
        color="Activity Type",
        text=y,
        template=PLOT_TEMPLATE,
        title=title,
        color_discrete_sequence=SITE_PRISM_SLATE,
        orientation="h",
    )
    fig.update_traces(
        texttemplate=f"%{{x}} {suffix}",
        textposition="outside",
        cliponaxis=False,
    )
    style_figure(fig, show_legend=False)
    fig.show()


plot_bar(activity_counts, title="Activity counts")

# %%
# move Virtual Ride to Ride
# assume Workout is Weight Training
# Crossfit is also Weight Training
df["Activity Type"] = df["Activity Type"].replace(
    {
        "Virtual Ride": "Ride",
        "Workout": "Weight Training",
        "Crossfit": "Weight Training",
    }
)
df = df[df["Activity Type"].isin(["Ride", "Run", "Weight Training", "Rowing", "Swim"])]

activity_counts = (
    df["Activity Type"]
    .value_counts()
    .rename_axis("Activity Type")
    .reset_index(name="count")
)
plot_bar(activity_counts, title="Activity counts (after merging)")


# %%
# sum by type and duraction in hours
activity_duration = (
    df.groupby("Activity Type")["duration_hours"]
    .sum()
    .astype(int)
    .reset_index(name="duration_hours")
    .sort_values("duration_hours", ascending=False)
)

plot_bar(
    activity_duration,
    y="Activity Type",
    x="duration_hours",
    title="Total duration by activity type",
    suffix="h",
)

# %%

# filter out data before 2015
df = df[df["date_parsed"] > "2015-01-01"]

fig = px.scatter(
    df,
    x="date_parsed",
    y="duration_hours",
    color="Activity Type",
    opacity=0.2,
    template=PLOT_TEMPLATE,
    title="Activity duration",
    color_discrete_sequence=SITE_PRISM_SLATE,
)
style_figure(fig)
fig.update_yaxes(ticksuffix=" h")
fig.show()

# %%
