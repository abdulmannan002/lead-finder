import * as React from 'react';

function icon(paths: React.ReactNode) {
  return function Icon({ className = 'h-4 w-4' }: { className?: string }) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden
      >
        {paths}
      </svg>
    );
  };
}

export const IconDashboard = icon(
  <>
    <rect x="3" y="3" width="7" height="9" rx="1.5" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="14" y="12" width="7" height="9" rx="1.5" />
    <rect x="3" y="16" width="7" height="5" rx="1.5" />
  </>,
);

export const IconLeads = icon(
  <>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 20c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" />
    <path d="M16.5 8.5c1.7.4 3 1.9 3 3.8" />
    <path d="M15.5 3.6a3.2 3.2 0 0 1 0 6.2" />
  </>,
);

export const IconCampaigns = icon(
  <>
    <path d="M4 12l16-7-4.5 14-4.3-4.8L4 12z" />
    <path d="M11.2 14.2L20 5" />
  </>,
);

export const IconReplies = icon(
  <>
    <path d="M21 14a3 3 0 0 1-3 3H8l-5 4V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v8z" />
    <path d="M8 9h8M8 12.5h5" />
  </>,
);

export const IconMetrics = icon(
  <>
    <path d="M4 20V10M10 20V4M16 20v-7M21 20H3" />
  </>,
);

export const IconSettings = icon(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.35a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.65 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.09c0 .68.4 1.3 1.03 1.56a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9c.26.63.88 1.03 1.56 1.03H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.56 1.03z" />
  </>,
);

export const IconAudit = icon(
  <>
    <path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3z" />
    <path d="M9.5 12l1.8 1.8 3.4-3.6" />
  </>,
);

export const IconDownload = icon(
  <>
    <path d="M12 3v11M7.5 10.5L12 15l4.5-4.5" />
    <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
  </>,
);

export const IconPlus = icon(<path d="M12 5v14M5 12h14" />);

export const IconLogout = icon(
  <>
    <path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3" />
    <path d="M15 16l4-4-4-4M19 12H9" />
  </>,
);

export const IconTrash = icon(
  <>
    <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    <path d="M6 7l1 13a2 2 0 0 0 2 1.8h6A2 2 0 0 0 17 20l1-13" />
  </>,
);

export const IconSearch = icon(
  <>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M20 20l-3.8-3.8" />
  </>,
);

export const IconStore = icon(
  <>
    <path d="M4 7l1.5-4h13L20 7" />
    <path d="M4 7h16v3a3 3 0 0 1-3 3 3 3 0 0 1-3-3 3 3 0 0 1-3 3 3 3 0 0 1-3-3 3 3 0 0 1-3 3 3 3 0 0 1-1-.17" />
    <path d="M5 12.8V21h14v-8.2M9 21v-5h6v5" />
  </>,
);

export const IconRequests = icon(
  <>
    <rect x="3" y="7" width="18" height="13" rx="2" />
    <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M3 12h18" />
  </>,
);

export const IconInboxLeads = icon(
  <>
    <path d="M3 13l3-8h12l3 8" />
    <path d="M3 13v5a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5" />
    <path d="M3 13h5a4 4 0 0 0 8 0h5" />
  </>,
);

export const IconVerified = icon(
  <>
    <path d="M12 2.5l2.4 1.8 3-.3 1.1 2.8 2.6 1.5-.7 2.9.7 2.9-2.6 1.5-1.1 2.8-3-.3-2.4 1.8-2.4-1.8-3 .3-1.1-2.8L3 14.1l.7-2.9L3 8.3l2.6-1.5L6.6 4l3 .3L12 2.5z" />
    <path d="M9.2 12.2l1.9 1.9 3.7-4" />
  </>,
);

export const IconPhone = icon(
  <path d="M5 4h4l1.5 4.5L8 10a12 12 0 0 0 6 6l1.5-2.5L20 15v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />,
);

export const IconChat = icon(
  <>
    <path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.7-1.2A9 9 0 1 0 12 3z" />
    <path d="M8 10h8M8 13.5h5" />
  </>,
);

export const IconGlobe = icon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z" />
  </>,
);

export const IconMapPin = icon(
  <>
    <path d="M12 21s-6.5-5.3-6.5-10.5a6.5 6.5 0 0 1 13 0C18.5 15.7 12 21 12 21z" />
    <circle cx="12" cy="10.3" r="2.3" />
  </>,
);
