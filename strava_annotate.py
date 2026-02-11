import pandas as pd
from plotfunctions import PRIMARY, SITE_BG
from plotly import graph_objects as go


def annotate_ampa(df: pd.DataFrame, fig: go.Figure):

    # Get AmPa long ride from june 2019, which is the closest to 20 hours
    june_start = pd.Timestamp("2019-06-01")
    july_start = pd.Timestamp("2019-07-01")
    june_2019 = df[
        (df["date_parsed"] >= june_start) & (df["date_parsed"] < july_start)
    ].copy()

    if not june_2019.empty:
        # sort by duration and get the longest ride
        june_2019 = june_2019.sort_values("duration_hours", ascending=False)
        highlight_row = june_2019.iloc[0]

        fig.add_trace(
            dict(
                type="scatter",
                mode="markers",
                x=[highlight_row["date_parsed"]],
                y=[highlight_row["duration_hours"]],
                showlegend=False,
                hoverinfo="skip",
                marker=dict(
                    symbol="square-open",
                    size=24,
                    color=PRIMARY,
                    line=dict(color=PRIMARY, width=3),
                ),
            )
        )

        fig.add_annotation(
            x=highlight_row["date_parsed"],
            y=highlight_row["duration_hours"],
            text="1",
            showarrow=False,
            xshift=30,
            font=dict(color=SITE_BG, size=12, weight="bold"),
            bgcolor=PRIMARY,
            bordercolor=PRIMARY,
            borderpad=4,
        )
        return fig


def annotate_commute_2g(df: pd.DataFrame, fig: go.Figure):

    # sep 1 - nov 10
    start = pd.Timestamp("2019-09-01")
    end = pd.Timestamp("2019-11-10")
    date_padding = pd.Timedelta(days=5)

    fig.add_shape(
        dict(
            type="rect",
            xref="x",
            yref="y",
            x0=start - date_padding,
            x1=end + date_padding,
            y0=0,
            y1=1.5,
            fillcolor="rgba(0,0,0,0)",
            line=dict(
                color=PRIMARY,
                width=3,
            ),
        )
    )

    fig.add_annotation(
        x=end + date_padding,
        y=0.5,
        text="2",
        showarrow=False,
        xshift=30,
        font=dict(color=SITE_BG, size=12, weight="bold"),
        bgcolor=PRIMARY,
        bordercolor=PRIMARY,
        borderpad=4,
    )

    return fig
