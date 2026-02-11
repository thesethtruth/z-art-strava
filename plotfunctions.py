import plotly.graph_objects as go
import plotly.io as pio
from pathlib import Path
import json

SITE_BG = "#0f172a"  # slate-900
SITE_TEXT = "#cbd5e1"  # muted white
SITE_HEADER = "#e6edf5"
SITE_AXIS = "#94a3b8"

SITE_PRISM_SLATE = [
    "#5FE3C3",
    "#4CC9F0",
    "#60A5FA",
    "#818CF8",
    "#A78BFA",
    "#C084FC",
    "#E879F9",
    "#F472B6",
    "#FB7185",
    "#F97316",
    "#FB923C",
    "#F59E0B",
    "#FACC15",
    "#A3E635",
    "#84CC16",
    "#34D399",
    "#10B981",
    "#14B8A6",
    "#2DD4BF",
    "#22D3EE",
    "#06B6D4",
    "#0EA5E9",
    "#38BDF8",
    "#7DD3FC",
]

PRIMARY = SITE_PRISM_SLATE[0]
SECONDARY = SITE_PRISM_SLATE[1]
ACCENT = SITE_PRISM_SLATE[5]

site_template = go.layout.Template(
    layout=go.Layout(
        paper_bgcolor=SITE_BG,
        plot_bgcolor=SITE_BG,
        colorway=SITE_PRISM_SLATE,
        font=dict(
            family="Poppins, sans-serif",
            size=13,
            color=SITE_TEXT,
        ),
        title=dict(
            x=0.5,
            xanchor="center",
            y=0.96,
            yanchor="top",
            font=dict(
                family="Josefin Sans, sans-serif",
                size=28,
                color=SITE_HEADER,
            ),
        ),
        legend=dict(
            bgcolor="rgba(15,23,42,0.45)",
            bordercolor="rgba(148,163,184,0.25)",
            borderwidth=1,
            orientation="h",
            x=0.5,
            xanchor="center",
            y=-0.22,
            yanchor="top",
            title=dict(
                side="top center",
                font=dict(
                    family="Josefin Sans, sans-serif",
                    size=18,
                    color=SITE_HEADER,
                ),
            ),
            entrywidthmode="fraction",
            entrywidth=0.15,
            font=dict(family="Poppins, sans-serif", size=14, color=SITE_TEXT),
        ),
        margin=dict(t=84, b=96, l=20, r=20),
        xaxis=dict(
            showgrid=False,
            zeroline=False,
            showline=True,
            linecolor=SITE_AXIS,
            linewidth=1.2,
            ticks="outside",
            ticklen=5,
            tickwidth=1.2,
            tickcolor=SITE_AXIS,
            tickfont=dict(family="Poppins, sans-serif", size=14, color=SITE_TEXT),
            automargin=True,
            title=None,
        ),
        yaxis=dict(
            showgrid=False,
            zeroline=False,
            showline=False,
            ticks="outside",
            ticklen=5,
            tickwidth=1.2,
            tickcolor=SITE_AXIS,
            tickfont=dict(family="Poppins, sans-serif", size=14, color=SITE_TEXT),
            automargin=True,
            title=None,
        ),
    )
)

# Register + set as default
pio.templates["site_slate"] = site_template
pio.templates.default = "site_slate"

PLOT_TEMPLATE = "site_slate"


def style_figure(fig: go.Figure, title: str = None, show_legend=None):
    layout_updates = {"xaxis_title": None, "yaxis_title": None}

    if title is not None:
        layout_updates["title"] = {
            "text": f"<span style='font-family:Josefin Sans,sans-serif;font-weight:700;letter-spacing:0.06em'>{title}</span>"
        }

    if show_legend is not None:
        layout_updates["showlegend"] = show_legend

    if layout_updates:
        fig.update_layout(**layout_updates)


def save_plot_json(fig: go.Figure, filename: Path):
    fig_dict = fig.to_plotly_json()
    layout = fig_dict.get("layout", {})

    layout.pop("paper_bgcolor", None)
    layout.pop("plot_bgcolor", None)

    template_layout = layout.get("template", {}).get("layout", {})
    template_layout.pop("paper_bgcolor", None)
    template_layout.pop("plot_bgcolor", None)

    with open(filename, "w") as f:
        json.dump(fig_dict, f)
