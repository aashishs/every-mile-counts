import { useEffect, useMemo, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import { routePositions } from '../utils/polyline';

export default function ActivityRouteMap({ activity }) {
  const el = useRef(null);
  const positions = useMemo(
    () => routePositions(activity),
    [activity?.polyline, activity?.gpsPoints?.latlng]
  );

  useEffect(() => {
    if (!el.current || positions.length < 2) return undefined;
    let cancelled = false;
    let map;

    (async () => {
      const leaflet = await import('leaflet');
      const L = leaflet.default || leaflet;
      if (cancelled || !el.current) return;
      map = L.map(el.current, {
        zoomControl: false,
        attributionControl: true,
        scrollWheelZoom: false,
      });
      L.control.zoom({ position: 'topright' }).addTo(map);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        maxZoom: 19,
      }).addTo(map);
      const line = L.polyline(positions, {
        color: '#2dd4bf',
        weight: 4,
        opacity: 0.95,
        lineJoin: 'round',
        lineCap: 'round',
      }).addTo(map);
      L.circleMarker(positions[0], {
        radius: 6,
        color: '#ffffff',
        fillColor: '#2dd4bf',
        fillOpacity: 1,
        weight: 2,
      }).addTo(map);
      L.circleMarker(positions[positions.length - 1], {
        radius: 7,
        color: '#ffffff',
        fillColor: '#fb923c',
        fillOpacity: 1,
        weight: 2,
      }).addTo(map);
      map.fitBounds(line.getBounds(), { padding: [28, 28] });
      setTimeout(() => map.invalidateSize(), 50);
    })();

    return () => {
      cancelled = true;
      if (map) map.remove();
    };
  }, [positions]);

  if (positions.length < 2) return null;

  return (
    <section className="mb-6">
      <h3 className="section-title mb-3">Route</h3>
      <div className="overflow-hidden rounded-2xl border border-line">
        <div ref={el} className="activity-map h-64 md:h-80 w-full bg-ink" />
      </div>
    </section>
  );
}
