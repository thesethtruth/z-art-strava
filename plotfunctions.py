import plotly.graph_objects as go
import plotly.io as pio
from plotly.utils import PlotlyJSONEncoder
from pathlib import Path
import json
from hclient import HetznerS3Client


PLOT_PATH = Path(__file__).parent / "plots"
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

client = HetznerS3Client(bucket_name="public-plots", data_path=PLOT_PATH)

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


def save_plot_json(fig: go.Figure, name: str, folder: Path = PLOT_PATH):
    fig_dict = fig.to_plotly_json()
    layout = fig_dict.get("layout", {})
    transparent = "rgba(0,0,0,0)"

    layout["paper_bgcolor"] = transparent
    layout["plot_bgcolor"] = transparent

    template_layout = layout.get("template", {}).get("layout", {})
    template_layout["paper_bgcolor"] = transparent
    template_layout["plot_bgcolor"] = transparent

    folder.mkdir(parents=True, exist_ok=True)
    filename = folder / f"{name}.json"

    with open(filename, "w", encoding="utf-8") as f:
        json.dump(fig_dict, f, cls=PlotlyJSONEncoder)


def upload_all_plots_to_s3(prefix: str = None):

    for file in PLOT_PATH.glob("*.json"):
        object_name = f"{prefix + '-' if prefix else ''}{file.stem}.json"
        client.upload_file(file, object_name=object_name)
