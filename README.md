# dsh-tvkt-vi

Chuẩn tiếng Việt kỹ thuật **TVKT-100** cho [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): một hợp đồng system prompt áp cho mọi mode, một skill nạp theo nhu cầu, một linter chạy được, và một agent mode riêng cho việc rà tài liệu.

Tiếng Việt của agent thường sai theo ba kiểu: dịch máy từ tiếng Anh, kiểu ghép động từ rỗng vào trước hành động thật, đổi tên định danh kỹ thuật, và khẳng định điều chưa kiểm chứng. Plugin này chặn cả ba ở tầng prompt, rồi đưa cả 30 quy tắc và 70 thuật ngữ vào một skill để không phải trả token cho chúng ở mọi request.

## Cài

```bash
# từ Git
dsh plugin --profile web add https://github.com/Hieupt1904/dsh-tvkt-vi.git

# từ thư mục cục bộ (đang phát triển)
dsh plugin --profile web add /duong/dan/dsh-tvkt-vi
```

Khởi động lại `dsh web` nếu profile không bật `patchReload: live`. Sau khi cài:

- Mọi agent trong profile nhận section **Chuẩn tiếng Việt (TVKT-100)** trong system prompt.
- Skill `tvkt-vi` xuất hiện trong catalog — agent tự nạp khi gặp việc viết/rà tiếng Việt.
- Settings → Agent presets có thêm mode **Tiếng Việt chuẩn (TVKT-100)**.

## Plugin làm gì

| Thành phần | Cơ chế | Tác động |
|---|---|---|
| Hợp đồng ngôn ngữ | `ctx.systemPrompt.section()` ở order `10150` — sau hướng dẫn công cụ, trước persona suffix | ~1,7 KB mỗi request; áp cho **mọi** mode, kể cả mode tự tạo |
| Skill `tvkt-vi` | `ctx.skills.registerProvider()` — đọc `SKILL.md` mỗi lần nạp, không chép tệp vào `~/.dsh/skills` | 0 token khi không nạp; ~6 KB khi nạp |
| Agent mode `tvkt-vi` | preset khai trong `cordis.patch.yml`, persona `dsh-persona` + bộ tool của mode `standard` | chỉ phiên chọn mode mới trả |
| Linter | `vendor/tvkt/` (bản đóng gói của TVKT-100 v1.0) + `skills/tvkt-vi/scripts/lint-text.py` | chạy cục bộ, không gọi mạng |

Ba lớp này cố ý tách nhau: hợp đồng ngắn là thứ bắt buộc phải có ở mọi request; bộ 30 quy tắc và 70 thuật ngữ thì không.

## Dùng

**Rà một đoạn đang soạn** (không tạo tệp tạm):

```bash
printf 'Hệ thống tiến hành kiểm tra dữ liệu một cách nhanh chóng.\n' \
  | python3 skills/tvkt-vi/scripts/lint-text.py
```

```text
TVKT-LINTER: <stdin> | ERROR=0, WARNING=2, INFO=0
1: WARNING L001 (TVKT-002): Cụm từ không ưu tiên: 'một cách nhanh chóng'.
    → Cân nhắc: 'trong thời gian xác định'. Chỉ thay khi không đổi nghĩa.
1: WARNING L001 (TVKT-002): Cụm từ không ưu tiên: 'tiến hành kiểm tra'.
    → Cân nhắc: 'kiểm tra'. Chỉ thay khi không đổi nghĩa.
```

**Trong hội thoại:**

```text
REWRITE theo TVKT: chuẩn hóa tài liệu api/readme.md, chỉ sửa hình thức.
REVIEW phần 3 giúp tôi, nêu mã TVKT cho từng chỗ.
Dịch đoạn này sang tiếng Việt kỹ thuật, giữ nguyên tên endpoint.
```

**Linter trong CI:**

```bash
python3 vendor/tvkt/tools/tvkt_lint.py docs/api.md --format json --fail-on WARNING
```

## Ba chế độ của mode

| Chế độ | Nhận khi nào | Được làm gì |
|---|---|---|
| DRAFT | người dùng cần viết mới | tạo tài liệu, ghi giả định, đánh dấu phần chưa xác minh |
| REVIEW | có văn bản sẵn, không nói rõ | chỉ báo vấn đề — **không sửa tệp** |
| REWRITE | yêu cầu chuẩn hóa | sao lưu → đề xuất từng đoạn → diff → chờ duyệt → mới áp dụng |

## Cấu hình

Plugin không có tuỳ chọn. Muốn đổi hợp đồng ngôn ngữ, sửa `lib/contract.js`. Muốn đổi thân skill, sửa `skills/tvkt-vi/SKILL.md` — provider đọc tệp trong `get()`, nên lần nạp kế tiếp đã thấy nội dung mới.

`TVKT_HOME` trỏ tới bộ TVKT-100 bản đầy đủ trên máy để `lint-text.py` dùng bản đang lưu hành thay cho `vendor/tvkt/`:

```bash
TVKT_HOME=/duong/dan/TVKT-100-v1.0 python3 skills/tvkt-vi/scripts/lint-text.py bai.md
```

## Giới hạn phải biết

- **Linter phủ 7/30 quy tắc.** TVKT-001, 004, 006-010, 012-015, 017-030 cần đọc hiểu; PASS không chứng minh tài liệu đúng kỹ thuật (TVKT-029).
- **Đếm "tiếng" bằng khoảng trắng.** Tiếng Việt ghép từ bằng khoảng trắng nên "người dùng" bị tính 2 đơn vị; ngưỡng 30/40 là gợi ý, không phải luật cứng.
- **L006 bắt nhầm.** "phải", "nên", "không được" dùng như từ thường vẫn bị báo INFO. Đó là mức thông tin, không phải lỗi.
- **Preset phụ thuộc bản DSH.** Danh sách 23 row trong `cordis.patch.yml` sao từ mode `standard` của DSH `0.2.2-rc.2`. Sau khi nâng cấp DSH, chạy `node scripts/check-drift.mjs`; một row trỏ module không còn tồn tại làm hỏng cả preset.
- **Hợp đồng tiếng Việt chiếm ~1,7 KB mỗi request.** Nếu bạn đã tự thêm khối TVKT vào `~/.dsh/AGENTS.md`, bỏ một trong hai để không trả tiền hai lần.
- **Mỗi loại thay đổi có độ trễ khác nhau.** Xem bảng dưới; đừng giả định mọi thứ đều nóng.
- **Skill trùng tên.** Provider của plugin ở hạng 300, nên thắng bản trong `~/.dsh/skills` (hạng 400) và thua bản trong `.dsh/skills` của project (hạng 100/200). Chỉ nên có một bản.

## Phạm vi tool của mode `tvkt-vi`

Preset gồm **standard + `tool-executor-ptc`**: 24 row, trong đó 23 row khớp `standard` và một row lấy từ `ptc`.

**CẢNH BÁO:** row đó không phải "thêm một tool" mà **đổi cách gọi tool**. Executor PTC biến `run_code` thành công cụ duy nhất gọi trực tiếp; model viết chương trình gọi các tool khác bên trong. Đây là hành vi của mode `ptc`, dùng khi cần gọi nhiều tool một lượt rồi lọc, gộp, đếm kết quả.

Muốn mode chỉ dùng tool trực tiếp như `standard`, xoá ba dòng này khỏi `cordis.patch.yml`, rồi chạy `npm run check-drift`:

```yaml
          - id: tool-executor-ptc
            name: '@deepseek-ai/dsh-tool-executor-ptc'
```

Nếu bỏ row, nhớ xoá cả `tool-executor-ptc` khỏi `INTENTIONAL_EXTRAS` trong `scripts/check-drift.mjs`.

Không chép ba khác biệt còn lại của `ptc`, vì chúng là cắt bớt có chủ ý chứ không phải năng lực thêm:

| `ptc` khác `standard` | Có chép? |
|---|---|
| thêm `tool-executor-ptc` | **có** |
| tắt `tool-plugin-manager` và `tool-plugin-market` | không — mode tiếng Việt vẫn cần quản lý plugin |
| bỏ `customSkillDirs` của `dsh-agent-preset` | không — bỏ thì mất skill `dsh-doc` |
| đổi ghi chú `apply_patch` | không — giữ nguyên như `standard` |

**Không khai lại plugin nằm ở bundle root.** `ego-browser`, `dsh-service`, `agent-team`, `dsh-mattpocock-skills-deck`, các MCP… đăng ký tool ở tầng root, mà agent của preset **thừa hưởng** tầng đó:

> `ToolRestriction` applies to the tools a scope inherits: the deployment-global layer plus every ancestor scope on its chain. — `docs/subsystems/tools.md`

Hệ quả: mọi mode đều thấy các tool đó mà không cần khai báo. Khai lại trong preset là trùng lặp; với row có dịch vụ hoặc HTTP route thì còn xung đột realm. Bằng chứng ngay trên máy này: phiên đang chạy dùng preset `full-spectrum` — danh sách của nó không có `ego-browser` lẫn MCP — nhưng vẫn có đủ `ego_*`, `mcp__*`, `list_agents`.

Muốn kiểm sau khi cài: mở mode `tvkt-vi`, xem danh sách tool có `run_code` (PTC) cùng `ego_*`, `mcp__*`; thiếu nhóm nào thì đó là lỗi mount của bundle tương ứng, không phải thiếu khai báo trong preset.

## Đúng hợp đồng provider skill

Bản `dsh-tvkt-vi` được đối chiếu với `@deepseek-ai/dsh-skill-office`, provider skill đóng gói chính thức của DSH:

| Hợp đồng | Cách làm |
|---|---|
| Huỷ được | `readFile(..., { signal })`, tôn trọng `options.signal` của consumer |
| Không ghim catalog hỏng | `list()` trả `{ candidates, complete }`; lỗi tạm thời → `complete: false` để registry thử lại |
| Lỗi tồn tại bị loại | `EACCES`/`EPERM`/`ENOTDIR` và frontmatter hỏng → bỏ entry kèm cảnh báo một lần |
| Nạp hỏng phải nổi lên | `get()` ném lỗi, không trả `undefined` im lặng; gọi `control.invalidate()` khi lỗi tồn tại |
| Thân skill sạch | `parseSkill()` cắt frontmatter; metadata lấy từ hằng số trong mã |
| Đường dẫn đa nền tảng | `resourceBase.path` dùng `/` |
| Chẩn đoán | tiếng Anh, qua `ctx.logger`, khử trùng lặp |

## Đúng hợp đồng bundle của DSH

| Yêu cầu | Cách khai | Ghi chú |
|---|---|---|
| Manifest bundle | `dsh.bundle.patch` → `./cordis.patch.yml` | thiếu nó, `dsh plugin` chỉ cài như dependency thường và cảnh báo |
| Dải DSH hỗ trợ | `engines.dsh: ">=0.2.0-rc.1 <0.3.0-0"` | DSH từ chối cài nếu không khớp, thay vì lỗi lúc mount |
| Peer được host chia sẻ | `@deepseek-ai/cordis` trong `peerDependencies`, có `-0` | thiếu nhánh prerelease thì mọi bản pre-release bị loại im lặng |
| Tiêu đề, mô tả, tài liệu chi tiết | `locale/en.json`, `locale/zh.json`, `docs/DETAIL*.md` | `meta.detail` phải nằm trong thư mục con, không ở gốc gói |
| Icon | `icon.svg` + trường `icon` trong manifest | SVG tự chứa, dưới 256 KiB |
| Bản dựng sẵn | `dsh.install.tarball` + asset tên cố định | **chỉ là gợi ý**: `dshmarket` không đọc trường này, nó đọc `tarball:` của entry danh mục |
| Không có UI trình duyệt | không khai `dsh.client` | bundle chỉ đóng góp cấu hình và module Node |

Bốn mục đầu và ba mục cuối đều có test chặn hồi quy trong `test/plugin.test.js`.

## Độ trễ của từng loại thay đổi

| Sửa gì | Hiệu lực khi nào | Vì sao |
|---|---|---|
| `skills/tvkt-vi/**` (thân, references) | **lần nạp kế tiếp**, không cần restart | provider đọc tệp trong `get()`; registry không cache thân skill |
| Tên hoặc mô tả skill | sau khi restart | catalog lấy từ `lib/skill.js`, không đọc frontmatter |
| `lib/contract.js` (hợp đồng prompt) | sau khi restart | section đăng ký một lần lúc mount |
| `lib/**` nói chung | sau khi restart | Node giữ module đã import |
| `cordis.patch.yml` | ngay, nếu profile bật `patchReload: live` | loader áp lại patch |


## Cài từ npm

```bash
dsh plugin --profile web add dsh-tvkt-vi
```

Bản trên registry: `0.4.0` (`latest`). Bản ghi `0.0.0-stage` còn nằm trong danh sách version do lần publish đầu bị cắt giữa đường; nó **không** phải bản cài được và đã bị `npm deprecate`.

Danh mục `awesome-dsh-plugin` tự ánh xạ repo sang gói npm: nó đọc `name` trong `package.json` của repo và kiểm `repository.url` của bản `latest` có chứa `Hieupt1904/dsh-tvkt-vi`. Entry **không** khai trường `npm` — bộ kiểm tra từ chối mọi trường ngoài `url`, `name`, `category`, `description`, `icon`, `tarball`.

## Đường phát hiện: index format 1 chỉ nhận npm

Đã kiểm trên index công bố ngày 2026-11-15 (`https://cdn.jsdelivr.net/npm/dsh-plugin-catalog/index.json`, format 1, 5.643 entry):

| Sự thật | Hệ quả |
|---|---|
| Mọi version trong index đều `source.type = "npm"` — 0 entry từ GitHub | một plugin không publish npm **không vào được** tab Discover lẫn tool `plugin_market` |
| Entry không có npm bị bộ sinh index bỏ, ghi `skipped.noNpm` | entry danh mục vẫn có (nó là danh sách), nhưng index là cửa khác |
| `build-index.mjs` đọc `data/npm-map.json` → `{ npm, version, publishedAt, enginesDsh }` | tên gói npm phải trùng tên plugin, hoặc khai qua `npm:` của entry |

Nên có **ba đường**, dùng được độc lập:

1. **`dsh plugin add <URL git>`** — chạy được ngay; đã mô phỏng bằng `npm install github:Hieupt1904/dsh-tvkt-vi` ra 0.3.0, và `hasLoadableEntry()` của chợ trả `true`.
2. **Nhánh chợ `dshmarket`** — đọc `tarball:` của entry danh mục; `dsh.install.tarball` trong `package.json` **không** phải nguồn nó dùng.
3. **Index format 1 (Discover)** — cần publish npm; hiện chưa có, và chưa đăng nhập npm trên máy này.

## Trạng thái trên chợ plugin

Repo đã public, có topic `dsh-plugin`, release có tarball tên cố định, và entry danh mục đang chờ duyệt: [PR #15602](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/15602). Sau khi merge, entry hiện trong DSH → Plugins → Discover và trong chợ `dshmarket`.

Thông báo cập nhật không phụ thuộc việc merge. Chợ đọc `raw.githubusercontent.com/Hieupt1904/dsh-tvkt-vi/HEAD/package.json` và so `version` với bản đang cài, nên mỗi lần tăng `version` rồi push là máy đã cài sẽ thấy "có bản mới". Repo private thì bước này trả 404 và không có thông báo nào — đó là lý do repo phải public.

## Cài sang máy khác

Cài một lần, sau đó DSH tự kéo cập nhật:

```bash
# máy đích cần: dsh đã cài, node >= 18, python3 (chỉ cho linter)
dsh plugin --profile web add https://github.com/Hieupt1904/dsh-tvkt-vi.git
```

Repro **private**, nên máy đích phải có quyền đọc: dùng `gh auth login` cùng tài khoản, hoặc cấu hình git credential. Nếu chuyển sang public thì lệnh trên chạy với bất kỳ ai:

```bash
gh repo edit Hieupt1904/dsh-tvkt-vi --visibility public --accept-visibility-change-consequences
```

Cập nhật về sau (cùng repo, git track `main` của package):

```bash
dsh plugin --profile web update dsh-tvkt-vi
node node_modules/dsh-tvkt-vi/scripts/check-drift.mjs   # đối chiếu preset với bản DSH trên máy đích
```

Kiểm tra sau khi cài, theo thứ tự:

1. `dsh --profile web --dump-config` → phải có `- id: dsh-tvkt-vi` và `- id: preset-tvkt-vi`, không có dòng cảnh báo mới.
2. Settings → Agent presets → thấy mode **Tiếng Việt chuẩn (TVKT-100)**, không báo "Failed to load".
3. Mở một phiên chọn mode đó, gọi `/skill tvkt-vi` → `Base directory` phải trỏ vào `node_modules/dsh-tvkt-vi/skills/tvkt-vi`.
4. Mở rộng: báo cáo nghiên cứu nằm ở repo TVKT-100 của máy gốc, không đi kèm gói này.

### Chuyển từ bản cài tay

Phiên bản trước khi có plugin dùng ba chỗ rời: mục TVKT trong `~/.dsh/AGENTS.md`, thư mục `~/.dsh/skills/tvkt-vi`, và preset chép tay trong `~/.dsh/profiles/web/cordis.patch.yml`. Cài plugin thì nên gỡ hai chỗ sau:

```bash
# 1. preset chép tay trong patch (nếu còn) — xoá entry insert chứa preset-tvkt-vi
#    giữ nguyên phần còn lại của tệp
cp ~/.dsh/profiles/web/cordis.patch.yml ~/.dsh/profiles/web/cordis.patch.yml.bak
$EDITOR ~/.dsh/profiles/web/cordis.patch.yml

# 2. bản skill chép tay
mv ~/.dsh/skills/tvkt-vi ~/.dsh/skills/tvkt-vi.bak
```

Để nguyên mục TVKT trong `~/.dsh/AGENTS.md` nếu máy đích còn chạy profile khác chưa cài plugin (headless, tui). Bỏ đi nếu chỉ dùng profile web — tiết kiệm khoảng 3 KB mỗi phiên, vì nội dung trùng với section của plugin.

## Gỡ

```bash
dsh plugin --profile web remove dsh-tvkt-vi
```

Lệnh này gỡ cả bundle patch, nên mode `tvkt-vi` biến mất theo. Cấu hình khác của bạn không bị đụng tới.

## Phát triển

```bash
node --test                 # 13 test: hợp đồng provider, thứ tự section, frontmatter, ngưỡng pruner, nạp lại nóng, registry thật
npm run check-drift         # so preset với standard của DSH đang cài
npm run lint:skill          # chạy linter lên chính SKILL.md
```

Cấu trúc:

```text
lib/contract.js              # hợp đồng ngôn ngữ (section prompt)
lib/index.js                 # apply(): section + đăng ký provider
lib/skill.js                 # provider: list() + get(), đọc SKILL.md mỗi lần nạp
cordis.patch.yml             # bundle patch: plugin row + preset tvkt-vi
skills/tvkt-vi/SKILL.md      # thân skill (một nguồn sự thật)
skills/tvkt-vi/references/   # thuật ngữ, mở rộng cho chat
skills/tvkt-vi/scripts/      # lint-text.py
vendor/tvkt/                 # linter + cấu hình của TVKT-100 v1.0
```

## Giấy phép và ghi công

Mã plugin: MIT (xem [LICENSE](LICENSE)).

`vendor/tvkt/` và nội dung 30 quy tắc lấy từ **TVKT-100 v1.0** — bộ chuẩn nội bộ của tác giả dự án, không phải tiêu chuẩn quốc gia và không phải bản dịch ASD-STE100. Bộ gốc chưa có tệp giấy phép; xem [NOTICE](NOTICE) trước khi phân phối lại.

---

## English

`dsh-tvkt-vi` packages the Vietnamese technical-writing standard **TVKT-100** as a DeepSeek Harness plugin: a compact system-prompt contract applied to every agent, an on-demand skill with the full rule set, a bundled linter (L001-L007), and an agent mode with DRAFT/REVIEW/REWRITE discipline. Keeps identifiers untranslated, bans machine-translation calques, and requires unverified statements to be labelled.

```bash
dsh plugin --profile web add https://github.com/Hieupt1904/dsh-tvkt-vi.git
```

Seven `node --test` cases cover registration, section ordering, skill frontmatter parity, and the prompt-pruner budget.
