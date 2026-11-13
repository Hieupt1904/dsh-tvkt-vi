# dsh-tvkt-vi

Chuẩn tiếng Việt kỹ thuật **TVKT-100** cho [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): một hợp đồng system prompt áp cho mọi mode, một skill nạp theo nhu cầu, một linter chạy được, và một agent mode riêng cho việc rà tài liệu.

Tiếng Việt của agent thường sai theo ba kiểu: dịch máy từ tiếng Anh ("tiến hành kiểm tra", "nhằm mục đích"), đổi tên định danh kỹ thuật, và khẳng định điều chưa kiểm chứng. Plugin này chặn cả ba ở tầng prompt, rồi đưa bộ quy tắc đầy đủ vào một skill để không phải trả token cho nó ở mọi request.

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

Ba lớp này cố ý tách nhau: hợp đồng ngắn là thứ bắt buộc phải có ở mọi request; 30 quy tắc đầy đủ thì không.

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

## Độ trễ của từng loại thay đổi

| Sửa gì | Hiệu lực khi nào | Vì sao |
|---|---|---|
| `skills/tvkt-vi/**` (thân, references) | **lần nạp kế tiếp**, không cần restart | provider đọc tệp trong `get()`; registry không cache thân skill |
| Tên hoặc mô tả skill | sau khi restart | catalog lấy từ `lib/skill.js`, không đọc frontmatter |
| `lib/contract.js` (hợp đồng prompt) | sau khi restart | section đăng ký một lần lúc mount |
| `lib/**` nói chung | sau khi restart | Node giữ module đã import |
| `cordis.patch.yml` | ngay, nếu profile bật `patchReload: live` | loader áp lại patch |

Cố ý chọn provider thay vì `ctx.skills.register()`: bản đăng ký runtime giữ thân skill trong bộ nhớ từ lúc mount, nên sửa tài liệu phải restart mới thấy — không hợp với một bộ chuẩn hay được chỉnh.

## Gỡ

```bash
dsh plugin --profile web remove dsh-tvkt-vi
```

Lệnh này gỡ cả bundle patch, nên mode `tvkt-vi` biến mất theo. Cấu hình khác của bạn không bị đụng tới.

## Phát triển

```bash
node --test                 # 12 test: hợp đồng provider, thứ tự section, frontmatter, ngưỡng pruner, nạp lại nóng, registry thật
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
