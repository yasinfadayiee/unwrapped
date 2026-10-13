// "Your digital life": the firsts and milestones from every export, in order.
// Events carry a `kind` plus numbers; the view turns them into sentences.

const minTs = (list, get = (x) => x.ts) => {
  let best = 0;
  for (const x of list || []) {
    const t = get(x);
    if (t > 0 && (!best || t < best)) best = t;
  }
  return best;
};

const MILESTONES = [100, 1000, 10000, 100000];

export function buildTimeline(datasets) {
  const events = [];
  const add = (ds, kind, ts, extra = {}) => {
    // Ignore missing and clearly broken dates (before 2004 or in the future).
    if (ts > Date.UTC(2004, 0, 1) && ts < Date.now() + 864e5) events.push({ platform: ds.platform, label: ds.label, kind, ts, ...extra });
  };
  for (const ds of datasets) {
    add(ds, 'joined', ds.account?.createdAt || 0);
    const followers = ds.platform === 'facebook' ? ds.lists?.friends : ds.platform === 'linkedin' ? ds.connections : ds.lists?.followers;
    const dated = (followers || []).map((f) => f.ts).filter((t) => t > 0).sort((a, b) => a - b);
    if (dated.length) {
      add(ds, ds.platform === 'facebook' ? 'firstFriend' : ds.platform === 'linkedin' ? 'firstConnection' : 'firstFollower', dated[0]);
      for (const n of MILESTONES) if (dated.length >= n) add(ds, 'milestone', dated[n - 1], { n });
      // The year that brought the most of today's followers.
      const years = new Map();
      for (const t of dated) years.set(new Date(t).getFullYear(), (years.get(new Date(t).getFullYear()) || 0) + 1);
      const [year, count] = [...years.entries()].reduce((a, b) => (b[1] > a[1] ? b : a));
      if (years.size > 1) add(ds, 'bestYear', Math.min(new Date(year, 11, 31, 12).getTime(), dated[dated.length - 1]), { n: count, year });
    }
    if (ds.platform !== 'facebook' && ds.platform !== 'linkedin') add(ds, 'firstFollow', minTs(ds.lists?.following));
    if (ds.media?.length) add(ds, 'firstPost', minTs(ds.media.filter((m) => m.kind === 'post')));
    if (ds.activity?.items) {
      add(ds, 'firstLike', minTs(ds.activity.items.liked));
      add(ds, 'firstComment', minTs(ds.activity.items.comments));
    }
    if (ds.tweets?.length) add(ds, 'firstTweet', minTs(ds.tweets.filter((t) => !t.isRT)));
    if (ds.watch?.length) add(ds, 'firstWatch', minTs(ds.watch, (t) => t));
  }
  return events.sort((a, b) => a.ts - b.ts);
}
