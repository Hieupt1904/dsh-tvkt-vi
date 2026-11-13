# Bảng thuật ngữ nhanh (T001-T070, bản rút)

Nguồn đầy đủ: `/home/hieupt/Documents/TVKT-100-v1.0/02-TVKT-DICTIONARY.md` và `config/terms.json`.

## Thuật ngữ chuẩn

người dùng · tài khoản · đăng nhập · xác thực · phân quyền · cấp quyền · thu hồi quyền · tạo · đọc · lưu · cập nhật · xóa · vô hiệu hóa · đồng bộ · gửi · nhận · kiểm tra · trả về · thử lại · nhật ký · sự kiện · yêu cầu API · phản hồi API · phiên · mã truy cập · quyền truy cập · vai trò · tài nguyên · điểm cuối API · tham số · tải trọng · mã trạng thái · giới hạn tốc độ · thời gian chờ · tính lũy đẳng · giao dịch · bản ghi · lược đồ · chỉ mục · bản sao lưu · khôi phục · hàng đợi · thông điệp · dịch vụ · mô-đun · cấu hình · môi trường triển khai · bản phát hành · triển khai · hoàn tác · giám sát · cảnh báo vận hành · số liệu đo · bản ghi truy vết · trường hợp kiểm thử · điều kiện chấp nhận · lỗi phần mềm · hồi quy · hợp đồng API · phụ thuộc · bí mật cấu hình · quyền tối thiểu · phạm vi truy cập · nhật ký kiểm toán · tác vụ nền.

## Cụm không ưu tiên (P001-P012)

| Không ưu tiên | Ưu tiên | Điều kiện |
|---|---|---|
| tiến hành kiểm tra | kiểm tra | cùng hành động |
| thực hiện lưu | lưu | cùng nghĩa |
| nhằm mục đích | để | chỉ mục đích |
| trong trường hợp | nếu | chỉ điều kiện logic |
| một cách nhanh chóng | trong thời gian xác định | phải kèm ngưỡng đo |
| một cách chính xác | theo tiêu chí xác định | phải nêu tiêu chí |
| có thể nói rằng | (bỏ) | không thêm thông tin |
| vân vân | liệt kê rõ | trong yêu cầu bắt buộc |
| khoảng chừng | khoảng | khi cho phép xấp xỉ |
| thao tác xử lý | động từ cụ thể | tùy ngữ cảnh |
| có khả năng xảy ra | có thể xảy ra | nói về khả năng |
| tiến hành triển khai | triển khai | cùng nghĩa |

## Cặp dễ nhầm — không tự thay thế

| Cặp | Phân biệt |
|---|---|
| xác thực / phân quyền | xác thực kiểm tra danh tính; phân quyền xác định quyền |
| xóa / vô hiệu hóa / ẩn | ba hành vi khác nhau, không thay nhau |
| lưu / đồng bộ | lưu không có nghĩa đồng bộ giữa các hệ thống |
| khởi tạo / bắt đầu | khởi tạo trạng thái hoặc tài nguyên; bắt đầu một tiến trình |
| lỗi xác thực / lỗi phân quyền | nguyên nhân và cách xử lý khác nhau |
| nhật ký / nhật ký kiểm toán | nhật ký kiểm toán có yêu cầu truy cứu và toàn vẹn riêng |
| trạng thái / sự kiện | trạng thái mô tả thời điểm; sự kiện mô tả việc đã xảy ra |

## Sáu mẫu câu

1. Quy định: `[Chủ thể] PHẢI [hành động] [đối tượng] [điều kiện].` — "Dịch vụ xác thực PHẢI kiểm tra thời hạn token trước khi chấp nhận token."
2. Điều kiện: `Nếu [điều kiện], [chủ thể] [kết quả].` — "Nếu token hết hạn, API trả về mã trạng thái 401."
3. Chức năng: `[Thành phần] [hành động] [đối tượng] để [mục đích].`
4. Quy trình: `Bước N. [Hành động].` + `Kết quả mong đợi: [trạng thái kiểm tra được].`
5. Cảnh báo: `CẢNH BÁO: [rủi ro]. Để tránh rủi ro, [biện pháp].`
6. Lỗi: `LỖI: [thất bại]. Nguyên nhân: [đã xác minh / chưa rõ]. Cách khắc phục: [hành động].`
