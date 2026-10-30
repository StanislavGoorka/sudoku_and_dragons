// In development, ?profile=2 gives a tab its own player (account and saved progress),
// so one browser can play both sides of a duel. (Tests run without a page, so without `location`.)
const profile = import.meta.env.DEV && typeof location !== 'undefined' ? new URLSearchParams(location.search).get('profile') : null;

/** Appended to storage keys of everything that belongs to one player. */
export const profileSuffix = profile ? `-${profile}` : '';
