import type { Resource } from "./board";

/** Small vector illustrations keep the map sharp at every board size. */
export function TerrainArt({ resource }: { resource: Resource }) {
  const ink = "#294b3d";
  switch (resource) {
    case "wood":
      return (
        <g stroke={ink} strokeWidth="1.1" strokeLinejoin="round">
          <ellipse
            cx="0"
            cy="10"
            rx="12"
            ry="3"
            fill="#294b3d"
            opacity=".2"
            stroke="none"
          />
          <path d="M-2 1h4v10h-4z" fill="#835c3c" />
          <path d="M0-15 -8-4h4l-7 8h5l-5 5h22L6 4h5L4-4h4z" fill="#3c805b" />
          <path
            d="M0-15v24h11L6 4h5L4-4h4z"
            fill="#1c563d"
            opacity=".45"
            stroke="none"
          />
          <path d="M-5-5 -1-11M-7 3l4-5" stroke="#a0d09c" opacity=".6" />
          <path d="M0-13v21" stroke="#70ab76" opacity=".7" />
        </g>
      );
    case "brick":
      return (
        <g stroke="#824736" strokeWidth="1">
          <ellipse
            cx="0"
            cy="10"
            rx="13"
            ry="3"
            fill="#683a2e"
            opacity=".2"
            stroke="none"
          />
          <path d="M-11 2 0-3l11 5-11 5z" fill="#e7a371" />
          <path d="M-11 2v5l11 5V7z" fill="#b9644b" />
          <path d="M11 2v5L0 12V7z" fill="#d7835a" />
          <path d="M-5-1v5m10-5v5M-5 5v5m10-5v5" fill="none" opacity=".65" />
        </g>
      );
    case "wheat":
      return (
        <g fill="none" stroke="#8a6428" strokeWidth="1.4" strokeLinecap="round">
          <ellipse
            cx="0"
            cy="11"
            rx="10"
            ry="2.5"
            fill="#82662e"
            opacity=".18"
            stroke="none"
          />
          <path
            d="M0 10V-12M0-5c-6 0-8-3-7-6 4 0 7 2 7 6Zm0 4c6 0 8-3 7-6-4 0-7 2-7 6ZM0 4c-5 0-7-2-7-5 4 0 6 2 7 5Zm0 3c5 0 7-2 7-5-4 0-6 2-7 5Z"
            fill="#f4d575"
          />
        </g>
      );
    case "ore":
      return (
        <g stroke="#596e72" strokeWidth="1" strokeLinejoin="round">
          <ellipse
            cx="0"
            cy="10"
            rx="14"
            ry="3"
            fill="#364f50"
            opacity=".2"
            stroke="none"
          />
          <path d="M-13 6-9-2l6-3 5 4 1 8-8 4z" fill="#a7bdb5" />
          <path d="M-1 6 2-4l7-2 5 6-1 8-7 3z" fill="#c3d3c9" />
          <path
            d="M5 1 13 0l-1 7-6 3-7-4z"
            fill="#748f88"
            opacity=".55"
            stroke="none"
          />
          <path d="M2-4 5 1l8-1M-9-2l4 4 7-3" fill="none" opacity=".7" />
        </g>
      );
    case "sheep":
      return (
        <g stroke="#526b4a" strokeWidth="1" strokeLinecap="round">
          <ellipse
            cx="0"
            cy="11"
            rx="13"
            ry="3"
            fill="#526b4a"
            opacity=".2"
            stroke="none"
          />
          <path d="M-6 6v4m11-4v4" strokeWidth="2" />
          <path
            d="M-8 5a5 5 0 0 1-1-9 5 5 0 0 1 8-3 5 5 0 0 1 8 2 5 5 0 0 1 1 9c-4 3-11 3-16 1Z"
            fill="#f0ead4"
          />
          <path
            d="M-10 2q3 4 8 3 6 2 10-1-2 5-8 5-8 0-10-4z"
            fill="#b8c4a7"
            opacity=".6"
            stroke="none"
          />
          <ellipse cx="9" cy="1" rx="4" ry="4" fill="#8c9b80" />
          <circle cx="10" cy="0" r=".6" fill="#293c30" stroke="none" />
        </g>
      );
    case "desert":
      return (
        <g stroke="#92774c" strokeWidth="1.2" fill="none" strokeLinecap="round">
          <ellipse
            cx="0"
            cy="10"
            rx="13"
            ry="3"
            fill="#8b7148"
            opacity=".18"
            stroke="none"
          />
          <path d="M-14 5c5-6 10-5 15-2s8 3 13-1M-12 9c7-3 12-2 17 1" />
          <path
            d="M2 1V-9c0-3 3-3 3 0V1M2-3h-3v-4m6 4h3v-4"
            stroke="#70835c"
            strokeWidth="2"
          />
        </g>
      );
  }
}

export function BuildingArt({ city, owner }: { city: boolean; owner: number }) {
  const color = owner === 0 ? "#e7af4e" : "#71b4ca";
  const light = owner === 0 ? "#ffe0a0" : "#c5eef4";
  return (
    <g
      pointerEvents="none"
      stroke="#203936"
      strokeWidth="1"
      strokeLinejoin="round"
    >
      <ellipse
        cy="7"
        rx={city ? 10 : 8}
        ry="3"
        fill="#172d2a"
        opacity=".35"
        stroke="none"
      />
      {city ? (
        <>
          <path d="M-7-5 0-11 7-5v12L0 10l-7-3z" fill={color} />
          <path
            d="M0-9 7-5V7l-7 3z"
            fill="#203b38"
            opacity=".25"
            stroke="none"
          />
          <path d="M-8-6 0-13 8-6 6-4 0-9l-6 5z" fill={light} />
          <path d="M0-13 8-6 6-4 0-9z" fill={color} />
          <path d="M-5 0 0 2 5 0" fill="none" strokeOpacity=".65" />
          <path d="M-4-5h2v3h-2z M2-5h2v3H2z" fill={light} strokeWidth=".5" />
        </>
      ) : (
        <>
          <path d="M-7-1 0-7 7-1v8L0 10l-7-3z" fill={color} />
          <path
            d="M0-5 7-1v8L0 10z"
            fill="#203b38"
            opacity=".25"
            stroke="none"
          />
          <path d="M-8-2 0-9 8-2 6 0 0-5l-6 5z" fill={light} />
          <path d="M0-9 8-2 6 0 0-5z" fill={color} />
        </>
      )}
      <path d="M-1 9V4h3v5" fill="#344840" />
    </g>
  );
}
