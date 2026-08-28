# 서버 — 작업을 클라우드에 저장하기

브라우저 자동 저장(`app/src/storage/autosave.ts`)은 **이 브라우저 하나**만
지킨다. 시크릿 모드로 열거나, 저장공간을 비우거나, 다른 컴퓨터에서 열면
빈 화면이다. 서버는 그 너머를 맡는다.

**PocketBase**를 쓴다. Go 바이너리 하나에 DB(SQLite)·로그인·REST API·관리자
화면이 다 들어 있어서, 메모리 1GB짜리 서버에도 얹힌다(실제로 쓰는 것은
수십 MB다). 직접 서버를 짜는 것보다 나은 가장 큰 이유는 **로그인을 손으로
구현하지 않아도 된다**는 점이다 — 보안 실수가 가장 나오기 쉬운 자리다.

> Supabase를 셀프호스팅하는 길도 있지만 Postgres·GoTrue·PostgREST·Kong을
> 전부 띄워야 해서 실질적으로 8GB급이 필요하다. 이 서버에는 안 들어간다.

---

## 1. PocketBase 설치

서버에 ssh로 들어가서:

```bash
sudo bash install-pocketbase.sh
```

하는 일:

- 스왑 2GB 확보 (메모리 1GB라 안전판이 필요하다)
- PocketBase 내려받아 `/opt/pocketbase`에 두기
- 전용 계정으로 systemd 등록 — 재부팅해도 알아서 뜬다
- **`127.0.0.1:8090`에만 묶는다.** 바깥에 바로 열지 않는다

## 2. nginx와 HTTPS

가비아 콘솔의 **보안그룹에서 80·443을 먼저 열어야 한다.** 안 열면 인증서
발급부터 실패한다.

```bash
sudo apt install -y nginx certbot python3-certbot-nginx

sudo cp nginx-pocketbase.conf /etc/nginx/sites-available/pocketbase
sudo sed -i 's/<도메인>/pb.example.com/' /etc/nginx/sites-available/pocketbase
sudo ln -sf /etc/nginx/sites-available/pocketbase /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

sudo certbot --nginx -d pb.example.com
```

도메인이 가비아에 있으면 DNS에서 A 레코드를 서버 공인IP로 걸어두고 시작한다.
certbot이 갱신 타이머까지 알아서 등록한다.

## 3. 관리자 계정

브라우저로 `https://pb.example.com/_/` 에 들어가면 처음 한 번 관리자 계정을
만들라고 한다.

아직 nginx를 안 세웠다면 ssh 터널로 먼저 볼 수 있다:

```bash
ssh -L 8090:127.0.0.1:8090 <사용자>@<서버IP>
```
→ `http://127.0.0.1:8090/_/`

## 4. `projects` 컬렉션 만들기

관리자 화면 → **Collections → New collection** → 이름 `projects` (Base 타입).

필드 두 개를 만든다:

| 이름 | 타입 | 설정 |
|---|---|---|
| `user` | Relation | `users` 컬렉션, **Required**, Max select 1, Cascade delete |
| `data` | JSON | **Required** |

`created`·`updated`는 PocketBase가 알아서 넣는다.

### 권한 규칙 (여기가 중요하다)

**API Rules** 탭에서 다섯 칸을 **전부** 아래와 같이 채운다:

```
user = @request.auth.id
```

이걸 비워두면 **아무나 남의 작업을 읽고 고칠 수 있다.** 규칙 칸이
비어 있다는 것은 PocketBase에서 "누구나 허용"이라는 뜻이지 "아무도
안 됨"이 아니다. 한 칸이라도 빠뜨리면 그 동작만 통째로 열린다.

### 한 사람에 한 자리

**Indexes**에서 유니크 인덱스를 하나 만든다:

```sql
CREATE UNIQUE INDEX idx_projects_user ON projects (user)
```

지금 클라이언트는 사람마다 자리 하나만 쓴다(`app/src/cloud/projects.ts`).
경합으로 두 개가 만들어지는 일을 DB에서 막아둔다.

## 5. 가입을 열어둘지 정하기

`users` 컬렉션의 **Create rule**이 비어 있으면 아무나 가입할 수 있다.
지금은 실서비스가 아니므로 내 계정만 쓰려면 Create rule에 아래를 넣어
가입을 막고, 관리자 화면에서 사용자를 직접 만든다:

```
@request.auth.id != ""
```

## 6. 앱 쪽 설정

`app/.env.local` (또는 배포 환경변수)에:

```
VITE_PB_URL=https://pb.example.com
```

**이 값이 없으면 클라우드 기능이 아예 안 보인다** — 지금까지처럼 완전히
로컬로만 돌아간다(`app/src/cloud/client.ts`). 서버 없이 쓰는 사람이
그대로 쓸 수 있어야 해서 이렇게 뒀다.

앱을 다른 주소에 배포한다면(권장 — 아래 참고) PocketBase 관리자 화면
**Settings → Application**에서 그 주소를 허용 목록에 넣는다.

---

## 정적 파일은 어디에 둘까

**앱 자체는 이 서버에서 서빙하지 않는 편이 낫다.**

가비아의 해외 무료 트래픽이 49GB뿐이다(국내는 1TB). 이 앱 번들이 gzip
기준 약 630KB라, 해외 방문 약 7만 8천 회면 다 쓴다. JSON API는 프로젝트
하나에 수십~수백 KB라 여기 견줄 바가 아니다.

```
Cloudflare Pages (무료·무제한)        가비아 VM
  정적 SPA                      ←→     PocketBase (JSON API)
```

전부 가비아에 두는 것도 물론 된다 — nginx가 `dist/`를 함께 서빙하면
되고, 그 경우 CORS 설정도 필요 없다. 해외 트래픽만 지켜보면 된다.

---

## 운영에서 잊기 쉬운 것

**백업.** SQLite 파일 하나(`/opt/pocketbase/pb_data/data.db`)가 전부다.
PocketBase 관리자 화면에 백업 기능이 내장돼 있고(Settings → Backups)
S3 호환 저장소로 자동 업로드도 된다 — 가비아 오브젝트 스토리지를 걸어두면
서버가 통째로 날아가도 살아남는다.

**메모리.** 이 서버는 1GB인데 이미 절반쯤 쓰고 있었다. PocketBase를 올린
뒤 `free -h`로 한 번 확인한다. 스왑은 설치 스크립트가 잡아뒀다.

**업데이트.** PocketBase는 바이너리 하나라 새 판으로 바꿔치고
`systemctl restart pocketbase` 하면 끝이다. 바꾸기 전에 백업을 먼저 받는다.

## 무엇이 올라가고 무엇이 안 올라가는가

올라가는 것은 `SavedProject` JSON — 양식·그린 것·용지와 배치 설정이다.
파일 저장(`저장` 버튼)·브라우저 자동 저장과 **똑같은 형식**이라, 저장
경로가 셋이어도 형식은 하나다.

**글꼴과 이미지 파일은 올라가지 않는다.** JSON에는 이름만 들어 있어서,
다른 컴퓨터에서 열면 같은 이름으로 다시 등록해야 한다(화면에도 그렇게
안내한다). 파일 바이트까지 올리는 것은 다음 할 일이다 — PocketBase의
파일 필드를 쓰면 되고, 그때는 nginx의 `client_max_body_size`와 디스크
용량을 함께 봐야 한다.
