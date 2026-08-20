import { useEffect, useMemo, useState } from 'react';
import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react';
import api from '../api/client';

const EMC_NAME = 'Every Mile Counts';
const LOGO_SRC = '/logo.png';
const QR_FG = '#0f1419';
const QR_TEAL = '#0d9488';

function joinUrl(joinPath) {
  return `${window.location.origin}${joinPath}`;
}

function formatState(state) {
  if (state === 'used_up') return 'Used up';
  if (state === 'disabled') return 'Disabled';
  if (state === 'expired') return 'Expired';
  return 'Active';
}

function roleLabel(type) {
  return type === 'coach' ? 'coach' : 'athlete';
}

function whatsappShareUrl({ clubName, role, url }) {
  const text = [
    `Join ${clubName || 'this club'} on Every Mile Counts as ${roleLabel(role) === 'coach' ? 'a coach' : 'an athlete'}.`,
    url,
  ].join('\n\n');
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load EMC logo'));
    img.src = src;
  });
}

function wrapLines(ctx, text, maxWidth) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 3);
}

async function downloadBrandedQr({ qrCanvas, clubName, role, filename }) {
  if (!qrCanvas) return;
  const logo = await loadImage(LOGO_SRC);
  const width = 720;
  const qrSize = 512;
  const header = 150;
  const footer = 180;
  const height = header + qrSize + footer;
  const poster = document.createElement('canvas');
  poster.width = width;
  poster.height = height;
  const ctx = poster.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  const logoTop = 36;
  ctx.drawImage(logo, width / 2 - 28, logoTop, 56, 56);

  ctx.fillStyle = QR_FG;
  ctx.textAlign = 'center';
  ctx.font = '700 40px "Barlow Condensed", "Arial Narrow", sans-serif';
  ctx.fillText(EMC_NAME, width / 2, 128);
  ctx.fillStyle = QR_TEAL;
  ctx.font = '600 15px "DM Sans", Arial, sans-serif';
  ctx.fillText('SCAN TO JOIN', width / 2, 148);

  const qrX = (width - qrSize) / 2;
  ctx.drawImage(qrCanvas, qrX, header, qrSize, qrSize);

  const logoSize = 108;
  const box = logoSize + 18;
  const cx = width / 2;
  const cy = header + qrSize / 2;
  ctx.fillStyle = '#ffffff';
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(cx - box / 2, cy - box / 2, box, box, 18);
    ctx.fill();
  } else {
    ctx.fillRect(cx - box / 2, cy - box / 2, box, box);
  }
  ctx.drawImage(logo, cx - logoSize / 2, cy - logoSize / 2, logoSize, logoSize);

  ctx.fillStyle = QR_FG;
  ctx.font = '700 32px "Barlow Condensed", "Arial Narrow", sans-serif';
  const nameLines = wrapLines(ctx, clubName || 'Club', width - 80);
  let y = header + qrSize + 48;
  for (const line of nameLines) {
    ctx.fillText(line, width / 2, y);
    y += 36;
  }
  ctx.fillStyle = QR_TEAL;
  ctx.font = '600 18px "DM Sans", Arial, sans-serif';
  ctx.fillText(`Join as ${roleLabel(role)}`, width / 2, y + 8);

  const link = document.createElement('a');
  link.download = filename;
  link.href = poster.toDataURL('image/png');
  link.click();
}

function ClubQrPreview({ value, clubName, role }) {
  return (
    <div className="bg-white rounded-2xl p-6 max-w-sm mx-auto text-center">
      <img src="/logo.svg" alt="" className="w-12 h-12 rounded-xl mx-auto mb-2" />
      <div className="font-display text-2xl font-bold tracking-tight text-[#0f1419]">{EMC_NAME}</div>
      <p className="text-[11px] uppercase tracking-[0.2em] text-[#0d9488] mt-1 mb-4">Scan to join</p>
      <div className="flex justify-center">
        <QRCodeSVG
          value={value}
          size={220}
          level="H"
          fgColor={QR_FG}
          bgColor="#ffffff"
          includeMargin
          imageSettings={{
            src: LOGO_SRC,
            height: 44,
            width: 44,
            excavate: true,
          }}
        />
      </div>
      <div className="font-display text-xl font-bold mt-4 text-[#0f1419] leading-tight">{clubName}</div>
      <div className="text-sm text-[#0d9488] font-semibold mt-1">Join as {roleLabel(role)}</div>
    </div>
  );
}

export default function ClubInviteCodes({ clubId, clubName, pendingCoach }) {
  const [codes, setCodes] = useState([]);
  const [limits, setLimits] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    type: 'athlete',
    maxActivations: 25,
    expiresAt: '',
    notes: '',
  });
  const [selected, setSelected] = useState(null);

  const load = async () => {
    const { data } = await api.get(`/clubs/${clubId}/invite-codes`);
    setCodes(data.codes || []);
    setLimits(data.limits || null);
    setForm((prev) => ({
      ...prev,
      maxActivations: data.limits?.defaultUses || prev.maxActivations,
    }));
  };

  useEffect(() => {
    load().catch((err) => setError(err.response?.data?.message || 'Could not load QR codes'));
  }, [clubId]);

  const selectedUrl = selected ? joinUrl(selected.joinPath) : '';

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMsg('');
    try {
      const { data } = await api.post(`/clubs/${clubId}/invite-codes`, {
        type: form.type,
        maxActivations: Number(form.maxActivations),
        expiresAt: form.expiresAt || undefined,
        notes: form.notes || undefined,
      });
      await load();
      setSelected(data.code);
      setMsg(`${form.type === 'coach' ? 'Coach' : 'Athlete'} QR created. Print or share it — the invite code stays hidden on signup.`);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not create QR code');
    } finally {
      setBusy(false);
    }
  };

  const disable = async (code) => {
    setError('');
    try {
      await api.patch(`/clubs/${clubId}/invite-codes/${code.id}`, { isDisabled: !code.isDisabled });
      await load();
      if (selected?.id === code.id) {
        setSelected((prev) => (prev ? { ...prev, isDisabled: !code.isDisabled, state: code.isDisabled ? 'active' : 'disabled' } : prev));
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Could not update QR code');
    }
  };

  const downloadPng = async () => {
    const canvas = document.getElementById('club-qr-download');
    if (!canvas || !selected) return;
    setError('');
    try {
      await downloadBrandedQr({
        qrCanvas: canvas,
        clubName,
        role: selected.type,
        filename: `${(clubName || 'club').replace(/\s+/g, '-').toLowerCase()}-${roleLabel(selected.type)}-qr.png`,
      });
    } catch {
      setError('Could not download QR image');
    }
  };

  const copyLink = async () => {
    if (!selectedUrl) return;
    try {
      await navigator.clipboard.writeText(selectedUrl);
      setMsg('Join link copied');
    } catch {
      setError('Could not copy link');
    }
  };

  const shareWhatsApp = (code) => {
    const url = joinUrl(code.joinPath);
    window.open(whatsappShareUrl({ clubName, role: code.type, url }), '_blank', 'noopener,noreferrer');
  };

  const atCap = limits && limits.remainingSlots <= 0;

  const grouped = useMemo(() => {
    const active = codes.filter((c) => c.state === 'active');
    const rest = codes.filter((c) => c.state !== 'active');
    return { active, rest };
  }, [codes]);

  return (
    <div className="space-y-4">
      <div className="card">
        <h3 className="font-semibold mb-1">Club QR codes</h3>
        <p className="text-sm text-muted mb-3">
          People who scan a QR land on signup already attached to this club. The invitation code is filled in and hidden.
          Keep volume down: {limits?.maxActive || 20} active QRs max, and each QR has a use limit.
        </p>
        {pendingCoach && (
          <p className="text-sm text-accent mb-3">
            Athlete QRs will not work until this club has at least one coach. Create a coach QR first.
          </p>
        )}
        {limits && (
          <p className="text-xs text-muted mb-3">
            {limits.activeCount} of {limits.maxActive} active QRs in use
            {atCap ? ' — disable an old one to create another.' : '.'}
          </p>
        )}
        {error && <div className="mb-3 rounded-xl border border-red-500/40 bg-red-500/10 text-red-200 p-3 text-sm">{error}</div>}
        {msg && <div className="mb-3 rounded-xl border border-brand/40 bg-brand/10 p-3 text-sm">{msg}</div>}
        <form className="grid md:grid-cols-2 gap-3" onSubmit={create}>
          <label className="text-sm">
            Register as
            <select
              className="mt-1"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
            >
              <option value="athlete">Athlete</option>
              <option value="coach">Coach</option>
            </select>
          </label>
          <label className="text-sm">
            Max uses
            <input
              className="mt-1"
              type="number"
              min={1}
              max={limits?.maxUses || 500}
              value={form.maxActivations}
              onChange={(e) => setForm({ ...form, maxActivations: e.target.value })}
              required
            />
          </label>
          <label className="text-sm">
            Expires (optional)
            <input
              className="mt-1"
              type="date"
              value={form.expiresAt}
              onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
            />
          </label>
          <label className="text-sm">
            Internal note (optional)
            <input
              className="mt-1"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Race weekend, flyer, etc."
            />
          </label>
          <button className="btn-primary md:col-span-2" type="submit" disabled={busy || atCap}>
            {busy ? 'Creating…' : 'Generate QR'}
          </button>
        </form>
      </div>

      {selected && (
        <div className="card">
          <h3 className="font-semibold mb-2">
            {selected.type === 'coach' ? 'Coach' : 'Athlete'} QR
          </h3>
          <p className="text-sm text-muted mb-3">
            {selected.remaining} of {selected.maxActivations} uses left
            {selected.expiresAt ? ` · expires ${new Date(selected.expiresAt).toLocaleDateString()}` : ''}
          </p>
          <div className="mb-3">
            <ClubQrPreview value={selectedUrl} clubName={clubName} role={selected.type} />
            <div className="fixed left-[-9999px] top-0" aria-hidden>
              <QRCodeCanvas
                id="club-qr-download"
                value={selectedUrl}
                size={512}
                level="H"
                fgColor={QR_FG}
                bgColor="#ffffff"
                includeMargin
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary btn-sm" type="button" onClick={downloadPng}>
              Download PNG
            </button>
            <button className="btn-outline btn-sm" type="button" onClick={() => shareWhatsApp(selected)}>
              Share on WhatsApp
            </button>
            <button className="btn-outline btn-sm" type="button" onClick={copyLink}>
              Copy join link
            </button>
            <button className="btn-outline btn-sm" type="button" onClick={() => setSelected(null)}>
              Close
            </button>
          </div>
        </div>
      )}

      <div className="card overflow-x-auto">
        <h3 className="font-semibold mb-3">Active QRs</h3>
        {!grouped.active.length ? (
          <p className="text-sm text-muted mb-0">No active QR codes yet.</p>
        ) : (
          <ul className="space-y-2 mb-0">
            {grouped.active.map((code) => (
              <li key={code.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-line pb-2">
                <div>
                  <div className="font-medium text-sm">
                    {code.type === 'coach' ? 'Coach' : 'Athlete'} · {code.remaining}/{code.maxActivations} uses
                  </div>
                  <div className="text-xs text-muted">
                    {formatState(code.state)}
                    {code.notes ? ` · ${code.notes}` : ''}
                    {code.expiresAt ? ` · expires ${new Date(code.expiresAt).toLocaleDateString()}` : ''}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className="btn-primary btn-sm" type="button" onClick={() => setSelected(code)}>
                    Show QR
                  </button>
                  <button className="btn-outline btn-sm" type="button" onClick={() => shareWhatsApp(code)}>
                    WhatsApp
                  </button>
                  <button className="btn-outline btn-sm" type="button" onClick={() => disable(code)}>
                    Disable
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!!grouped.rest.length && (
        <div className="card overflow-x-auto">
          <h3 className="font-semibold mb-3">Disabled / used / expired</h3>
          <ul className="space-y-2 mb-0">
            {grouped.rest.map((code) => (
              <li key={code.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm">
                <div>
                  <div className="font-medium">
                    {code.type === 'coach' ? 'Coach' : 'Athlete'} · {formatState(code.state)} · {code.activationsUsed}/{code.maxActivations}
                  </div>
                  {code.notes && <div className="text-xs text-muted">{code.notes}</div>}
                </div>
                {code.isDisabled ? (
                  <button className="btn-outline btn-sm" type="button" onClick={() => disable(code)}>
                    Re-enable
                  </button>
                ) : (
                  <button className="btn-outline btn-sm" type="button" onClick={() => setSelected(code)}>
                    Show QR
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
