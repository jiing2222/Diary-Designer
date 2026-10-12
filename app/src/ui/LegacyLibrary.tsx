import { useState } from 'react';
import { idbEntries, idbGet } from '../storage/idb';
import { readProject, type SavedProject } from '../core/project';
import { loadMeta } from '../storage/v2';

/** 기존 목록이 안 보일 때 원본 저장소를 읽어 확인한다. 이 화면은 데이터를 쓰거나 지우지 않는다. */
export function LegacyLibrary() {
  const [report, setReport] = useState<{ project: SavedProject | null; error: string | null; fonts: string[]; images: string[]; migratedAt?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function inspect() {
    setBusy(true);
    try {
      const [raw, fonts, images, meta] = await Promise.all([
        idbGet<string>('project', 'current'), idbEntries<unknown>('fonts'), idbEntries<unknown>('images'), loadMeta(),
      ]);
      const parsed = raw === null ? null : readProject(JSON.parse(raw));
      setReport({
        project: parsed && 'ok' in parsed ? parsed.ok : null,
        error: parsed && 'error' in parsed ? parsed.error : null,
        fonts: fonts.map(([name]) => name), images: images.map(([name]) => name), migratedAt: meta.migratedAt,
      });
    } catch {
      setReport({ project: null, error: '기존 저장소를 읽지 못했어요.', fonts: [], images: [] });
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="legacy-library" onToggle={(e) => { if (e.currentTarget.open && !report && !busy) void inspect(); }}>
      <summary>기존 작업 확인</summary>
      {busy && <p>기존 저장소를 확인하고 있어요.</p>}
      {report && <div>
        <p>지금 주소: {window.location.origin}</p>
        {report.error ? <p>{report.error}</p> : report.project ? <>
          <p>이전 저장소에 작업 {report.project.templates.length}개가 있어요. 마지막 저장: {report.project.savedAt}</p>
          <ul>{report.project.templates.map((t, i) => <li key={t.id ?? i}>{t.name}{t.kind === 'notebook' ? ' (노트 — 이전 버전에 보관)' : ''}</li>)}</ul>
        </> : <p>이 주소의 이전 저장소에는 저장된 작업이 없어요. 전에 쓰던 브라우저·주소의 저장소는 따로 있어요.</p>}
        <p>등록 글꼴 {report.fonts.length}개 · 이미지 {report.images.length}개</p>
        {report.fonts.length > 0 && <p>글꼴: {report.fonts.join(', ')}</p>}
        {report.images.length > 0 && <p>이미지: {report.images.join(', ')}</p>}
        {report.migratedAt && <p>새 목록으로 처음 옮긴 시각: {report.migratedAt}</p>}
      </div>}
    </details>
  );
}
