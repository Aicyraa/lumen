from fastapi import FastAPI

app = FastAPI()  # STUB


def get_llm():
    raise NotImplementedError


def ingest(): ...
def query(): ...
def delete_document(): ...
