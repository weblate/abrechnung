from uuid import UUID

import schema
from aiohttp import web
from aiohttp.abc import Request

from abrechnung.http.serializers import TransactionSerializer
from abrechnung.http.utils import json_response, validate

routes = web.RouteTableDef()


@routes.get(r"/groups/{group_id:\d+}/transactions")
async def list_transactions(request):
    group_id: int = int(request.match_info["group_id"])
    transactions = request.app["group_read_service"].list_transactions(
        user_id=request["user"]["user_id"], group_id=group_id
    )

    serializer = TransactionSerializer(transactions)
    return json_response(data=serializer.to_repr())


@routes.post(r"/groups/{group_id:\d+}/transactions")
@validate(
    schema.Schema(
        {
            "description": str,
            "type": str,
            "value": schema.Or(float, int),
            "currency_symbol": str,
            "currency_conversion_rate": schema.Or(float, int),
        }
    )
)
async def create_transaction(request: Request, data: dict):
    group_id: int = int(request.match_info["group_id"])

    transaction_id = request.app["transaction_service"].create_transaction(
        user_id=request["user"]["user_id"],
        group_id=group_id,
        description=data["description"],
        type=data["type"],
        currency_symbol=data["currency_symbol"],
        currency_conversion_rate=float(data["currency_conversion_rate"]),
        value=float(data["value"]),
    )

    return json_response(data={"transaction_id": str(transaction_id)})


@routes.get(r"/groups/{group_id:\d+}/transactions/{transaction_id:\d+}")
async def get_transaction(request: Request):

    try:
        transaction = request.app["group_read_service"].get_transaction(
            user_id=request["user"]["user_id"],
            group_id=int(request.match_info["group_id"]),
            transaction_id=int(request.match_info["transaction_id"]),
        )
    except PermissionError:
        raise web.HTTPForbidden(reason="permission denied")

    serializer = TransactionSerializer(transaction)

    return json_response(data=serializer.to_repr())


@routes.post(r"/groups/{group_id:\d+}/transactions/{transaction_id:\d+}/commit")
async def commit_transaction(request: Request):
    try:
        request.app["transaction_service"].commit_transaction(
            user_id=request["user"]["user_id"],
            transaction_id=int(request.match_info["transaction_id"]),
        )
    except PermissionError:
        raise web.HTTPForbidden(reason="permission denied")

    return json_response(status=web.HTTPNoContent.status_code)


@routes.post(
    r"/groups/{group_id:\d+}/transactions/{transaction_id:\d+}/creditor_shares"
)
@validate(
    schema.Schema(
        {
            "account_id": schema.Use(UUID),
            "value": schema.Or(float, int),
        }
    )
)
async def add_or_change_creditor_share(request: Request, data: dict):
    try:
        request.app["transaction_service"].add_or_change_creditor_share(
            user_id=request["user"]["user_id"],
            transaction_id=int(request.match_info["transaction_id"]),
            account_id=UUID(data["account_id"]),
            value=float(data["value"]),
        )
    except PermissionError:
        raise web.HTTPForbidden(reason="permission denied")

    return json_response(status=web.HTTPNoContent.status_code)


@routes.post(
    r"/groups/{group_id:\d+}/transactions/{transaction_id:\d+}/creditor_shares/switch"
)
@validate(
    schema.Schema(
        {
            "account_id": schema.Use(UUID),
            "value": schema.Or(float, int),
        }
    )
)
async def switch_creditor_share(request: Request, data: dict):
    try:
        request.app["transaction_service"].switch_creditor_share(
            user_id=request["user"]["user_id"],
            transaction_id=int(request.match_info["transaction_id"]),
            account_id=UUID(data["account_id"]),
            value=float(data["value"]),
        )
    except PermissionError:
        raise web.HTTPForbidden(reason="permission denied")

    return json_response(status=web.HTTPNoContent.status_code)


@routes.delete(
    r"/groups/{group_id:\d+}/transactions/{transaction_id:\d+}/creditor_shares"
)
@validate(
    schema.Schema(
        {
            "account_id": schema.Use(UUID),
        }
    )
)
async def delete_creditor_share(request: Request, data: dict):

    try:
        request.app["transaction_service"].delete_creditor_share(
            user_id=request["user"]["user_id"],
            transaction_id=int(request.match_info["transaction_id"]),
            account_id=UUID(data["account_id"]),
        )
    except PermissionError:
        raise web.HTTPForbidden(reason="permission denied")

    return json_response(status=web.HTTPNoContent.status_code)


@routes.post(r"/groups/{group_id:\d+}/transactions/{transaction_id:\d+}/debitor_shares")
@validate(
    schema.Schema(
        {
            "account_id": schema.Use(UUID),
            "value": schema.Or(float, int),
        }
    )
)
async def add_or_change_debitor_share(request: Request, data: dict):
    try:
        request.app["transaction_service"].add_or_change_debitor_share(
            user_id=request["user"]["user_id"],
            transaction_id=int(request.match_info["transaction_id"]),
            account_id=UUID(data["account_id"]),
            value=float(data["value"]),
        )
    except PermissionError:
        raise web.HTTPForbidden(reason="permission denied")

    return json_response(status=web.HTTPNoContent.status_code)


@routes.post(
    r"/groups/{group_id:\d+}/transactions/{transaction_id:\d+}/debitor_shares/switch"
)
@validate(
    schema.Schema(
        {
            "account_id": schema.Use(UUID),
            "value": schema.Or(float, int),
        }
    )
)
async def switch_debitor_share(request: Request, data: dict):
    try:
        request.app["transaction_service"].switch_debitor_share(
            user_id=request["user"]["user_id"],
            transaction_id=int(request.match_info["transaction_id"]),
            account_id=UUID(data["account_id"]),
            value=float(data["value"]),
        )
    except PermissionError:
        raise web.HTTPForbidden(reason="permission denied")

    return json_response(status=web.HTTPNoContent.status_code)


@routes.delete(
    r"/groups/{group_id:\d+}/transactions/{transaction_id:\d+}/debitor_shares"
)
@validate(
    schema.Schema(
        {
            "account_id": schema.Use(UUID),
        }
    )
)
async def delete_debitor_share(request: Request, data: dict):
    try:
        request.app["transaction_service"].delete_debitor_share(
            user_id=request["user"]["user_id"],
            transaction_id=int(request.match_info["transaction_id"]),
            account_id=UUID(data["account_id"]),
        )
    except PermissionError:
        raise web.HTTPForbidden(reason="permission denied")

    return json_response(status=web.HTTPNoContent.status_code)