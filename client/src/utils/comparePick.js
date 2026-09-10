import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { sportFamily } from './format';

export function toggleComparePick(prev, activity) {
  if (prev.some((item) => item.id === activity.id)) {
    return prev.filter((item) => item.id !== activity.id);
  }
  if (prev.length >= 3) return prev;
  if (prev.length && sportFamily(prev[0]) !== sportFamily(activity)) return prev;
  return [...prev, activity];
}

export function comparePickDisabled(picked, activity) {
  if (picked.some((item) => item.id === activity.id)) return false;
  if (picked.length >= 3) return true;
  const family = picked.length ? sportFamily(picked[0]) : '';
  if (family && sportFamily(activity) !== family) return true;
  return false;
}

export function comparePickHint(picked) {
  const family = picked.length ? sportFamily(picked[0]) : '';
  if (!picked.length) return 'Pick 2 or 3 sessions of the same sport.';
  if (picked.length === 1) return `Pick 1 or 2 more ${family} sessions.`;
  if (picked.length === 2) return `Compare these two, or pick one more ${family}.`;
  return `Compare these three ${family} sessions.`;
}

export function compareHref(picked, from) {
  const params = new URLSearchParams({
    a: picked[0].id,
    b: picked[1].id,
    from,
  });
  if (picked[2]) params.set('c', picked[2].id);
  return `/activities/compare?${params}`;
}

export function useComparePick(fromPath) {
  const navigate = useNavigate();
  const [comparing, setComparing] = useState(false);
  const [picked, setPicked] = useState([]);
  const canCompare = picked.length >= 2 && picked.length <= 3;

  useEffect(() => {
    setComparing(false);
    setPicked([]);
  }, [fromPath]);

  return {
    comparing,
    picked,
    canCompare,
    start: () => {
      setComparing(true);
      setPicked([]);
    },
    cancel: () => {
      setComparing(false);
      setPicked([]);
    },
    togglePick: (activity) => setPicked((prev) => toggleComparePick(prev, activity)),
    isPicked: (activity) => picked.some((item) => item.id === activity.id),
    pickDisabled: (activity) => comparePickDisabled(picked, activity),
    pickHint: comparePickHint(picked),
    goCompare: () => {
      if (!canCompare) return;
      navigate(compareHref(picked, fromPath));
    },
  };
}
