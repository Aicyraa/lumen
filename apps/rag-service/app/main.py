from app.api.factory import create_app
from app.core.env import load_env

load_env()  # DATABASE_URL etc. from the app's own .env; real environment variables win

app = create_app()  # uvicorn entry: app.main:app
