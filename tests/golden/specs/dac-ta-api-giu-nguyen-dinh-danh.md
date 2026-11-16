# Đặc tả API xuất báo cáo

Trường `report_id` trả về mã định danh duy nhất. Endpoint `POST /v1/reports/export`
nhận tham số `format` và trả về `202 Accepted`. Mã lỗi `ERR_RATE_LIMIT` xuất hiện
khi vượt giới hạn tốc độ.
