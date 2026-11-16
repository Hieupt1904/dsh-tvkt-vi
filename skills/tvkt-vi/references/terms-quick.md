# Bảng thuật ngữ nhanh (T001-T070)

<!-- TỆP SINH TỰ ĐỘNG — không sửa tay. -->
<!-- Nguồn: vendor/tvkt/config/terms.json. Sinh lại: node scripts/gen-terms-quick.mjs -->

Từ điển phiên bản 1.0. 70 thuật ngữ, 12 cụm không ưu tiên.

Ghi chú nguồn: Từ điển khởi đầu TVKT-100: thuật ngữ được phê duyệt T001-T023; T024-T070 đang đề xuất, cần được phê duyệt theo dự án.

Chỉ nhóm **đã duyệt** là chuẩn. Nhóm **đề xuất** chưa được phê duyệt: dùng thì
phải nói rõ là đề xuất, không được gọi là thuật ngữ chuẩn của dự án.

## Thuật ngữ đã duyệt (23)

Dùng các thuật ngữ này. Đây là nhóm duy nhất được coi là chuẩn.

| Mã | Thuật ngữ | Định nghĩa | Phạm vi |
|---|---|---|---|
| T001 | người dùng | Người tương tác với hệ thống | general-software |
| T002 | tài khoản | Thực thể quản lý danh tính và thông tin liên quan | general-software |
| T003 | đăng nhập | Thiết lập trạng thái truy cập theo cơ chế đăng nhập | general-software |
| T004 | xác thực | Kiểm tra bằng chứng danh tính | general-software |
| T005 | phân quyền | Gán hoặc xác định quyền cho chủ thể | general-software |
| T006 | cấp quyền | Cho phép chủ thể sử dụng một quyền cụ thể | general-software |
| T007 | thu hồi quyền | Loại bỏ quyền đã cấp | general-software |
| T008 | tạo | Làm xuất hiện đối tượng mới | general-software |
| T009 | đọc | Lấy thông tin từ đối tượng | general-software |
| T010 | lưu | Ghi nhận dữ liệu vào nơi lưu trữ | general-software |
| T011 | cập nhật | Thay đổi dữ liệu hiện có | general-software |
| T012 | xóa | Loại bỏ dữ liệu theo cơ chế xóa đã định nghĩa | general-software |
| T013 | vô hiệu hóa | Ngừng cho phép sử dụng nhưng không nhất thiết xóa | general-software |
| T014 | đồng bộ | Đưa dữ liệu giữa các thành phần về trạng thái nhất quán theo quy tắc | general-software |
| T015 | gửi | Chuyển thông tin đến đích | general-software |
| T016 | nhận | Tiếp nhận thông tin từ nguồn | general-software |
| T017 | kiểm tra | Đánh giá đối tượng theo điều kiện xác định | general-software |
| T018 | trả về | Cung cấp kết quả cho bên gọi | general-software |
| T019 | thử lại | Thực hiện lại hành động sau một lần thử | general-software |
| T020 | nhật ký | Bản ghi sự kiện hoặc hoạt động | general-software |
| T021 | sự kiện | Điều đã xảy ra và được hệ thống ghi nhận hoặc phát ra | general-software |
| T022 | yêu cầu API | Thông điệp gửi đến giao diện API để yêu cầu thao tác | general-software |
| T023 | phản hồi API | Thông điệp kết quả của yêu cầu API | general-software |

## Thuật ngữ đề xuất (47)

Đang chờ duyệt. Dùng được nếu dự án đã chấp nhận, nhưng không được gọi là chuẩn.

| Mã | Thuật ngữ | Định nghĩa | Phạm vi |
|---|---|---|---|
| T024 | yêu cầu | Thông tin chỉ dẫn hệ thống thực hiện một hành động hoặc đáp ứng một điều kiện | software-extension |
| T025 | phiên | Ngữ cảnh tương tác được duy trì trong một khoảng thời gian | software-extension |
| T026 | mã truy cập | Thông tin dùng để chứng minh hoặc cho phép truy cập theo một cơ chế | software-extension |
| T027 | quyền truy cập | Khả năng được cho phép thực hiện một hành động trên tài nguyên | software-extension |
| T028 | vai trò | Tập quyền hoặc trách nhiệm được gán cho chủ thể | software-extension |
| T029 | tài nguyên | Đối tượng mà hệ thống quản lý hoặc cung cấp | software-extension |
| T030 | điểm cuối API | Địa chỉ và quy ước để gọi một chức năng của API | software-extension |
| T031 | tham số | Giá trị được cung cấp để điều khiển lời gọi hoặc hành vi | software-extension |
| T032 | tải trọng | Phần dữ liệu chính của một thông điệp | software-extension |
| T033 | mã trạng thái | Mã biểu thị kết quả của thao tác theo giao thức hoặc quy ước | software-extension |
| T034 | lỗi xác thực | Lỗi liên quan đến việc xác minh bằng chứng danh tính | software-extension |
| T035 | lỗi phân quyền | Lỗi liên quan đến quyền thực hiện hành động | software-extension |
| T036 | giới hạn tốc độ | Quy tắc giới hạn số yêu cầu trong một khoảng thời gian | software-extension |
| T037 | thời gian chờ | Khoảng thời gian tối đa trước khi ngừng chờ kết quả | software-extension |
| T038 | thử lại tự động | Hệ thống tự gửi lại yêu cầu theo điều kiện xác định | software-extension |
| T039 | tính lũy đẳng | Thuộc tính mà việc thực hiện lặp lại không làm thay đổi thêm hiệu quả cuối cùng theo định nghĩa thao tác | software-extension |
| T040 | giao dịch | Nhóm thao tác được xử lý theo một tập bảo đảm nhất định | software-extension |
| T041 | bản ghi | Một đơn vị dữ liệu có cấu trúc trong nơi lưu trữ | software-extension |
| T042 | bảng dữ liệu | Tập bản ghi theo lược đồ trong cơ sở dữ liệu quan hệ | software-extension |
| T043 | lược đồ | Mô tả cấu trúc và ràng buộc dữ liệu | software-extension |
| T044 | chỉ mục | Cấu trúc hỗ trợ tìm kiếm hoặc truy cập dữ liệu | software-extension |
| T045 | bản sao lưu | Bản dữ liệu được giữ để hỗ trợ phục hồi | software-extension |
| T046 | khôi phục | Đưa dữ liệu hoặc hệ thống về trạng thái mục tiêu | software-extension |
| T047 | hàng đợi | Cơ chế lưu và chuyển các công việc hoặc thông điệp chờ xử lý | software-extension |
| T048 | thông điệp | Đơn vị thông tin trao đổi giữa các thành phần | software-extension |
| T049 | dịch vụ | Thành phần cung cấp chức năng qua giao diện xác định | software-extension |
| T050 | mô-đun | Đơn vị tổ chức chức năng và mã nguồn | software-extension |
| T051 | cấu hình | Tập giá trị điều khiển hành vi hệ thống | software-extension |
| T052 | môi trường triển khai | Tập hạ tầng và cấu hình nơi hệ thống được chạy | software-extension |
| T053 | bản phát hành | Phiên bản sản phẩm được công bố hoặc phân phối | software-extension |
| T054 | triển khai | Đưa một phiên bản thành phần vào môi trường đích | software-extension |
| T055 | hoàn tác | Quay lại thay đổi theo cơ chế đã xác định | software-extension |
| T056 | giám sát | Thu thập và đánh giá dấu hiệu hoạt động của hệ thống | software-extension |
| T057 | cảnh báo vận hành | Thông báo cho người vận hành khi điều kiện giám sát được kích hoạt | software-extension |
| T058 | số liệu đo | Giá trị định lượng về hành vi hoặc trạng thái hệ thống | software-extension |
| T059 | bản ghi truy vết | Dữ liệu mô tả chuỗi xử lý của một yêu cầu hoặc tác vụ | software-extension |
| T060 | trường hợp kiểm thử | Tập điều kiện, bước và kết quả mong đợi để kiểm tra một hành vi | software-extension |
| T061 | điều kiện chấp nhận | Tiêu chí cần đạt để chấp nhận yêu cầu hoặc tính năng | software-extension |
| T062 | lỗi phần mềm | Hành vi thực tế khác với hành vi mong đợi đã xác định | software-extension |
| T063 | hồi quy | Sự xuất hiện lại của lỗi hoặc suy giảm hành vi sau thay đổi | software-extension |
| T064 | hợp đồng API | Quy ước về dữ liệu, hành vi và kết quả giữa bên cung cấp và bên gọi | software-extension |
| T065 | phụ thuộc | Quan hệ khiến một thành phần cần thành phần hoặc điều kiện khác | software-extension |
| T066 | bí mật cấu hình | Giá trị nhạy cảm dùng cho xác thực hoặc bảo vệ truy cập | software-extension |
| T067 | quyền tối thiểu | Nguyên tắc chỉ cấp quyền cần thiết để hoàn thành nhiệm vụ | software-extension |
| T068 | phạm vi truy cập | Giới hạn tài nguyên hoặc hành động mà quyền áp dụng | software-extension |
| T069 | nhật ký kiểm toán | Bản ghi hỗ trợ truy cứu thay đổi hoặc hành động quan trọng | software-extension |
| T070 | tác vụ nền | Công việc chạy ngoài luồng xử lý tương tác trực tiếp | software-extension |

## Cụm không ưu tiên (12)

Không tự thay thế bằng tìm chuỗi. Đọc câu, xác định nghĩa, rồi mới sửa.

| Mã | Không ưu tiên | Ưu tiên | Điều kiện | Mức |
|---|---|---|---|---|
| P001 | tiến hành kiểm tra | kiểm tra | Khi cùng hành động | WARNING |
| P002 | thực hiện lưu | lưu | Khi cùng nghĩa | WARNING |
| P003 | nhằm mục đích | để | Khi chỉ mục đích | WARNING |
| P004 | trong trường hợp | nếu | Khi chỉ điều kiện logic | WARNING |
| P005 | một cách nhanh chóng | trong thời gian xác định | Khi yêu cầu phải đo được; bổ sung ngưỡng cụ thể | WARNING |
| P006 | một cách chính xác | theo tiêu chí xác định | Khi cần kiểm thử; nêu tiêu chí | WARNING |
| P007 | có thể nói rằng | bỏ cụm từ | Khi không thêm thông tin | WARNING |
| P008 | vân vân | liệt kê rõ hoặc dẫn danh sách | Đặc biệt trong yêu cầu bắt buộc | WARNING |
| P009 | khoảng chừng | khoảng | Chỉ khi cho phép xấp xỉ | WARNING |
| P010 | thao tác xử lý | nêu động từ cụ thể | Tùy ngữ cảnh | WARNING |
| P011 | có khả năng xảy ra | có thể xảy ra | Khi nói về khả năng | WARNING |
| P012 | tiến hành triển khai | triển khai | Khi cùng nghĩa | WARNING |

## Danh sách phẳng nhóm đã duyệt

Chỉ để tra nhanh; nghĩa và phạm vi xem bảng phía trên.

- người dùng · tài khoản · đăng nhập · xác thực · phân quyền · cấp quyền · thu hồi quyền · tạo
- đọc · lưu · cập nhật · xóa · vô hiệu hóa · đồng bộ · gửi · nhận
- kiểm tra · trả về · thử lại · nhật ký · sự kiện · yêu cầu API · phản hồi API
