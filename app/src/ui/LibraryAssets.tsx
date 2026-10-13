import { useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { FONT_ACCEPT, fontLabelOf, hasFont, registerFont, type UserFont } from '../fonts/registry';
import { IMAGE_ACCEPT, hasImage, imageLabelOf, registerImage, type UserImage } from '../images/registry';
import { imagesInUse, libraryFonts, libraryImages, reusableIdFor, worksUsingAsset } from '../core/assets';
import { DEFAULT_FONT_FAMILY } from '../core/style';
import { removeAssetWithConfirm } from './removeAsset';

/**
 * Library → Images · Fonts(리뉴얼 7-3, 세부계획 B ‘Library 화면 시안’).
 *
 * Projects·Diaries와 같은 틀 — 왼쪽은 목록 고르기, 가운데는 내용. 정책은 core/assets:
 * Images는 최신순, Fonts는 즐겨찾기가 위·가나다순. 쓰는 중인 것을 지우면 목록에서만 빠지고,
 * 파일은 쓰는 작업이 하나도 없게 될 때 지워진다. 파일은 [올리기]나 끌어다 놓기로 여러 개를 한 번에.
 */

type ImageFilter = 'all' | 'used' | 'unused';

export function LibraryImages() {
  const userImages = useStore((s) => s.userImages);
  const works = useStore((s) => s.works);
  const [filter, setFilter] = useState<ImageFilter>('all');
  const upload = useUpload('image');
  const listed = libraryImages(userImages);
  const used = useMemo(() => imagesInUse(works), [works]);
  const shown = listed.filter((i) => filter === 'all' || used.has(i.id) === (filter === 'used'));
  const filters: [ImageFilter, string, number][] = [
    ['all', '모든 이미지', listed.length],
    ['used', '사용 중', listed.filter((i) => used.has(i.id)).length],
    ['unused', '안 쓰는 것', listed.filter((i) => !used.has(i.id)).length],
  ];

  return (
    <div className="library-projects">
      <aside className="projects-panel" aria-label="이미지 고르기">
        <h2>Images</h2>
        {filters.map(([id, label, count]) => (
          <button key={id} className={`project-filter ${filter === id ? 'on' : ''}`} onClick={() => setFilter(id)}>
            <span className="filter-name">{label}</span>
            <span className="filter-count">{count}</span>
          </button>
        ))}
      </aside>
      <div className="library-pane projects-content" {...upload.dropProps}>
        <div className="library-head">
          <h2>
            {filters.find((f) => f[0] === filter)![1]} <span className="projects-count">{shown.length}개</span>
          </h2>
          <button className="primary" onClick={upload.pick}>
            + 이미지 올리기
          </button>
        </div>
        {upload.error && <p className="modal-note warn">{upload.error}</p>}
        {shown.length === 0 ? (
          <div className="empty-card">
            {filter === 'all'
              ? '아직 올린 이미지가 없어요. 파일을 여기로 끌어다 놓아도 돼요.'
              : '해당하는 이미지가 없어요.'}
          </div>
        ) : (
          <div className="design-grid asset-grid">
            {shown.map((img) => (
              <ImageTile key={img.id} image={img} />
            ))}
          </div>
        )}
        {upload.input}
      </div>
    </div>
  );
}

function ImageTile({ image }: { image: UserImage }) {
  const works = useStore((s) => s.works);
  const count = worksUsingAsset(works, 'image', image.id);
  return (
    <div className="asset-tile">
      <div className="design-thumb">
        {image.url ? (
          <img src={image.url} alt={imageLabelOf(image)} />
        ) : (
          <span className="asset-missing" title="같은 이름의 파일을 다시 올리면 되살아나요">
            ⚠ 파일 없음
          </span>
        )}
      </div>
      <AssetName label={imageLabelOf(image)} onRename={(v) => useStore.getState().renameUserImage(image.id, v)} />
      <div className="asset-meta">
        <span className="muted">{count > 0 ? `작업 ${count}개` : '안 씀'}</span>
        <RemoveButton kind="image" id={image.id} label={imageLabelOf(image)} />
      </div>
    </div>
  );
}

const DEFAULT_SAMPLE = '가나다라 Aa 1234';

export function LibraryFonts() {
  const userFonts = useStore((s) => s.userFonts);
  const [which, setWhich] = useState<'mine' | 'builtin'>('mine');
  const [sample, setSample] = useState(DEFAULT_SAMPLE);
  const upload = useUpload('font');
  const listed = libraryFonts(userFonts);
  const text = sample.trim() || DEFAULT_SAMPLE;

  return (
    <div className="library-projects">
      <aside className="projects-panel" aria-label="글꼴 고르기">
        <h2>Fonts</h2>
        <button className={`project-filter ${which === 'mine' ? 'on' : ''}`} onClick={() => setWhich('mine')}>
          <span className="filter-name">등록한 글꼴</span>
          <span className="filter-count">{listed.length}</span>
        </button>
        <button className={`project-filter ${which === 'builtin' ? 'on' : ''}`} onClick={() => setWhich('builtin')}>
          <span className="filter-name">기본 글꼴</span>
          <span className="filter-count">1</span>
        </button>
      </aside>
      <div className="library-pane projects-content" {...(which === 'mine' ? upload.dropProps : {})}>
        <div className="library-head">
          <h2>{which === 'mine' ? '등록한 글꼴' : '기본 글꼴'}</h2>
          {which === 'mine' && (
            <button className="primary" onClick={upload.pick}>
              + 글꼴 올리기
            </button>
          )}
        </div>
        <label className="lib-field">
          <span>견본 글자</span>
          <input
            className="lib-input"
            placeholder={DEFAULT_SAMPLE}
            value={sample}
            maxLength={60}
            onChange={(e) => setSample(e.target.value)}
          />
        </label>
        {which === 'builtin' ? (
          <div className="font-list">
            <div className="font-line">
              <span className="font-line-name">{DEFAULT_FONT_FAMILY}</span>
              <span className="font-line-sample">{text}</span>
            </div>
          </div>
        ) : (
          <>
            {upload.error && <p className="modal-note warn">{upload.error}</p>}
            {listed.length === 0 ? (
              <div className="empty-card">아직 등록한 글꼴이 없어요. TTF·OTF 파일을 여기로 끌어다 놓아도 돼요.</div>
            ) : (
              <div className="font-list">
                {listed.map((f) => (
                  <FontLine key={f.id} font={f} sample={text} />
                ))}
              </div>
            )}
            {upload.input}
          </>
        )}
      </div>
    </div>
  );
}

function FontLine({ font, sample }: { font: UserFont; sample: string }) {
  const works = useStore((s) => s.works);
  const count = worksUsingAsset(works, 'font', font.id);
  const loaded = hasFont(font.id);
  return (
    <div className="font-line">
      <button
        className={`font-fav ${font.favorite ? 'on' : ''}`}
        onClick={() => useStore.getState().toggleFontFavorite(font.id)}
        aria-label={font.favorite ? '즐겨찾기 풀기' : '즐겨찾기'}
        title={font.favorite ? '즐겨찾기 풀기' : '즐겨찾기'}
      >
        {font.favorite ? '★' : '☆'}
      </button>
      <AssetName label={fontLabelOf(font)} onRename={(v) => useStore.getState().renameUserFont(font.id, v)} />
      <span className="font-line-sample" style={loaded ? { fontFamily: font.family } : undefined}>
        {loaded ? (
          sample
        ) : (
          <span className="asset-warn" title="이 기기에 파일이 없어요 — 같은 이름의 파일을 다시 올리면 되살아나요">
            ⚠ 이 기기에 파일 없음
          </span>
        )}
      </span>
      <span className="muted">{count > 0 ? `작업 ${count}개` : '안 씀'}</span>
      <RemoveButton kind="font" id={font.id} label={fontLabelOf(font)} />
    </div>
  );
}

/** 이름 — 두 번 눌러 바꾼다(예전 디자인 관리와 같은 손놀림). */
function AssetName({ label, onRename }: { label: string; onRename: (label: string) => void }) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <input
        className="design-name-input"
        defaultValue={label}
        autoFocus
        maxLength={80}
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (v && v !== label) onRename(v);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') setEditing(false);
        }}
      />
    );
  }
  return (
    <button
      type="button"
      className="design-name"
      onDoubleClick={() => setEditing(true)}
      title={`${label} — 두 번 눌러 이름 바꾸기`}
    >
      {label}
    </button>
  );
}

/** 지우기 단추 — 확인은 ui/removeAsset.ts. */
function RemoveButton({ kind, id, label }: { kind: 'image' | 'font'; id: string; label: string }) {
  return (
    <button className="ghost danger asset-remove" onClick={() => removeAssetWithConfirm(kind, id, label)}>
      지우기
    </button>
  );
}

/**
 * 파일 올리기 — [올리기] 단추와 끌어다 놓기가 같이 쓴다. 같은 이름을 다시 올리면 파일 없이 이름만
 * 남은 것·목록에서 뺀 것의 id를 이어받는다(core/assets `reusableIdFor`).
 */
function useUpload(kind: 'image' | 'font') {
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  async function take(files: File[]) {
    setError(null);
    const failed: string[] = [];
    for (const file of files) {
      const name = file.name.replace(/\.[^.]+$/, '');
      const s = useStore.getState();
      try {
        if (kind === 'image') s.addUserImage(await registerImage(file, reusableIdFor(s.userImages, name, hasImage)));
        else s.addUserFont(await registerFont(file, reusableIdFor(s.userFonts, name, hasFont)));
      } catch (e) {
        failed.push(`${file.name}: ${e instanceof Error ? e.message : '읽지 못했어요'}`);
      }
    }
    if (failed.length > 0) setError(failed.join(' · '));
  }

  return {
    error,
    pick: () => fileRef.current?.click(),
    dropProps: {
      onDragOver: (e: React.DragEvent) => {
        if (e.dataTransfer.types.includes('Files')) e.preventDefault();
      },
      onDrop: (e: React.DragEvent) => {
        if (e.dataTransfer.files.length === 0) return;
        e.preventDefault();
        void take([...e.dataTransfer.files]);
      },
    },
    input: (
      <input
        ref={fileRef}
        type="file"
        multiple
        accept={kind === 'image' ? IMAGE_ACCEPT : FONT_ACCEPT}
        hidden
        onChange={(e) => {
          void take([...(e.target.files ?? [])]);
          e.target.value = '';
        }}
      />
    ),
  };
}
