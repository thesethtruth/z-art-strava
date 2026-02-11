import plotly.graph_objects as go

PLOT_TEMPLATE = "plotly_white"
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


# --- Site-matched Plotly style spec ---
SITE_BG = "#0f172a"  # slate-900
SITE_PANEL = "#1e293b"  # slate-800
SITE_TEXT = "#cbd5e1"  # slate-300 (muted white)
SITE_HEADER = "#e6edf5"  # soft near-white
SITE_AXIS = "#94a3b8"  # slate-400
SITE_GRID = "rgba(148,163,184,0.18)"

PLOT_TEMPLATE = "plotly_dark"  # good base for slate backgrounds

X_AXIS_STYLE = {
    "showgrid": False,
    "zeroline": False,
    "showline": True,
    "linecolor": SITE_AXIS,
    "linewidth": 1.2,
    "ticks": "outside",
    "ticklen": 5,
    "tickwidth": 1.2,
    "tickcolor": SITE_AXIS,
    "tickfont": {"family": "Poppins, sans-serif", "size": 12, "color": SITE_TEXT},
    "title": None,
}
Y_AXIS_STYLE = {
    "showgrid": False,
    "zeroline": False,
    "showline": False,
    "ticks": "outside",
    "ticklen": 5,
    "tickwidth": 1.2,
    "tickcolor": SITE_AXIS,
    "tickfont": {"family": "Poppins, sans-serif", "size": 12, "color": SITE_TEXT},
    "title": None,
}


def style_figure(fig: go.Figure, title: str = None, show_legend=None):
    fig.update_xaxes(**X_AXIS_STYLE)
    fig.update_yaxes(**Y_AXIS_STYLE)

    layout_updates = {
        "paper_bgcolor": SITE_BG,
        "plot_bgcolor": SITE_BG,
        "font": {"family": "Poppins, sans-serif", "size": 13, "color": SITE_TEXT},
        "colorway": SITE_PRISM_SLATE,
        "margin": {"l": 24, "r": 24, "t": 72, "b": 24},
        "legend": {
            "bgcolor": "rgba(15,23,42,0.45)",
            "bordercolor": "rgba(148,163,184,0.25)",
            "borderwidth": 1,
            "font": {"family": "Poppins, sans-serif", "size": 12, "color": SITE_TEXT},
            "title": {
                "font": {
                    "family": "Josefin Sans, sans-serif",
                    "size": 13,
                    "color": SITE_HEADER,
                }
            },
        },
    }

    if title is not None:
        layout_updates["title"] = {
            # Josefin header + thicker + extra tracking
            "text": f"<span style='font-family:Josefin Sans,sans-serif;font-weight:700;letter-spacing:0.06em'>{title}</span>",
            "x": 0.02,
            "xanchor": "left",
            "y": 0.98,
            "yanchor": "top",
            "font": {"size": 28, "color": SITE_HEADER},
        }

    if show_legend is not None:
        layout_updates["showlegend"] = show_legend

    fig.update_layout(**layout_updates)
