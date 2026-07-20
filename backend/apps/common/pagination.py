from rest_framework.pagination import CursorPagination, PageNumberPagination


class StandardCursorPagination(CursorPagination):
    page_size = 24
    page_size_query_param = "page_size"
    max_page_size = 100
    ordering = "-created_at"


class StandardPageNumberPagination(PageNumberPagination):
    page_size = 24
    page_size_query_param = "page_size"
    max_page_size = 100
