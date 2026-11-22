// Custom 1.5px monoline icon set, drawn for this app (24px grid).
const P: Record<string, string> = {
  home: 'M3.5 11.2 12 4l8.5 7.2M6 9.5V20h4.5v-5.5h3V20H18V9.5',
  money: 'M3 7.5h18v11H3zM3 11h18M7 15h3M16.5 4.5 7 7.5',
  plus: 'M12 5v14M5 12h14',
  clients: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5M16 4.3a3.5 3.5 0 0 1 0 6.4M18.5 14.8c1.6.8 2.7 2.6 3 5.2',
  quote: 'M6 3h8.5L19 7.5V21H6zM14 3v5h5M9 12.5h7M9 16h5',
  settings: 'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4ZM19.4 13.5l1.6 1.2-2 3.4-1.9-.7a7.6 7.6 0 0 1-2.2 1.3L14.6 21h-4l-.4-2.3a7.6 7.6 0 0 1-2.2-1.3l-2 .7-2-3.4 1.7-1.2a7.4 7.4 0 0 1 0-2.6L4 9.7l2-3.4 2 .7a7.6 7.6 0 0 1 2.2-1.3L10.6 3h4l.3 2.3c.8.3 1.6.7 2.2 1.3l1.9-.7 2 3.4-1.6 1.2a7.4 7.4 0 0 1 0 2.6Z',
  in: 'M17 7 7 17M7 9v8h8',
  out: 'M7 17 17 7M9 7h8v8',
  search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM20 20l-4.8-4.8',
  close: 'M6 6l12 12M18 6 6 18',
  chevron: 'M9.5 6l6 6-6 6',
  back: 'M14.5 6l-6 6 6 6',
  download: 'M12 4v11M7 10.5l5 5 5-5M5 20h14',
  share: 'M12 15V3.5M7.5 8 12 3.5 16.5 8M6 12H4.5v8.5h15V12H18',
  trash: 'M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10.5 11v5.5M13.5 11v5.5',
  edit: 'M4 20h4L19.5 8.5a2.8 2.8 0 0 0-4-4L4 16v4ZM13.5 6.5l4 4',
  check: 'M5 12.5 10 17.5 19.5 7',
  logout: 'M14 4h5.5v16H14M10 8l-4 4 4 4M6 12h10',
  sun: 'M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9ZM12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z',
  split: 'M12 3v6M12 9 5 16v5M12 9l7 7v5',
  layers: 'M12 3 2.5 8 12 13l9.5-5L12 3ZM2.5 12.5 12 17.5l9.5-5M2.5 16.5 12 21.5l9.5-5',
  phone: 'M5 4h4l1.5 4.5-2.3 1.4a11 11 0 0 0 5.9 5.9l1.4-2.3L20 15v4a1.5 1.5 0 0 1-1.6 1.5A16.5 16.5 0 0 1 3.5 5.6 1.5 1.5 0 0 1 5 4Z',
  mail: 'M3 5.5h18v13H3zM3.5 6l8.5 7 8.5-7',
  arrow: 'M2 5h54M50 1l6 4-6 4',
  shield: 'M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6L12 3Z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20.5c.8-3.8 3.8-6 7.5-6s6.7 2.2 7.5 6',
  copy: 'M8 8h12v12H8zM16 8V4H4v12h4',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  box: 'M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5zM3.5 7.5 12 12l8.5-4.5M12 12v9',
  work: 'M4 6.5l1.8 1.8L9 5M4 12.5l1.8 1.8L9 11M4 18.5l1.8 1.8L9 17M12.5 7h7.5M12.5 13h7.5M12.5 19h7.5',
  bug: 'M8 10a4 4 0 0 1 8 0v4.5a4 4 0 0 1-8 0zM12 11.5V19M9.5 5.8 8 4M14.5 5.8 16 4M8 12.5H4M20 12.5h-4M8 16.5 4.8 18M16 16.5l3.2 1.5M8 9.5 4.8 8M16 9.5 19.2 8',
  flag: 'M5.5 21V3.5M5.5 4h12l-2.5 4.25L17.5 12.5h-12',
  repeat: 'M16.5 3 19.5 6l-3 3M4.5 11.5v-.5a5 5 0 0 1 5-5h10M7.5 21l-3-3 3-3M19.5 12.5v.5a5 5 0 0 1-5 5h-10',
  calendar: 'M4 5.5h16V20H4zM4 10h16M8.5 3v4M15.5 3v4',
  folder: 'M3 6h6.5l2 2.5H21V19H3z',
  diamond: 'M12 3.5 20.5 12 12 20.5 3.5 12z',
};

export type IconName = keyof typeof P;

export function Icon({ name, size, className }: { name: IconName; size?: number; className?: string }) {
  if (name === 'arrow') {
    return (
      <svg viewBox="0 0 58 10" fill="none" stroke="currentColor" strokeWidth="1.2" className={className} aria-hidden>
        <path d={P.arrow} />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={P[name]} />
    </svg>
  );
}
