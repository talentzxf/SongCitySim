Meta Data Config service

Run:

cd server/meta_data_config
npm install
npm run dev

Endpoints:
- GET /api/meta/categories
- GET /api/meta/buildings
- GET /api/meta/crops
- GET /api/meta/log
- POST /api/upload (multipart/form-data file, fields: category, item)
- GET /api/export/sqlite

Static resources served at /resource/meta_data
