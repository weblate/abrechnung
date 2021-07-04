"""
DBTest command
"""

import asyncio
import json
import re
import time

import asyncpg

from . import compare
from .. import subcommand
from .. import psql as psql_command
from .. import util


class DBTest(subcommand.SubCommand):
    def __init__(self, config, **args):
        self.config = config
        self.psql = None
        self.done = False
        self.populate_db = args['populate']
        self.prepare_action = args['prepare_action']

        self.notifications = asyncio.Queue()

    @staticmethod
    def argparse_register(subparser):
        subparser.add_argument(
            '--confirm-destructive-test',
            action='store_true',
            help='confirm that you are aware that the database contents '
                 'will be destroyed'
        )
        subparser.add_argument(
            '--prepare-action',
            help='run the given psql action before running the tests'
        )
        subparser.add_argument(
            '--populate',
            action='store_true',
            help='once the test is done, populate the db with example data'
        )

    @staticmethod
    def argparse_validate(args, error_cb):
        if not args.pop('confirm_destructive_test'):
            error_cb('dbtest will drop all data from your database. '
                     'invoke it with --confirm-destructive-test '
                     'if you understand this')

    async def run(self):
        """
        CLI entry point
        """
        if self.prepare_action:
            print(f'prepare action: {util.BOLD}psql {self.prepare_action}{util.NORMAL}')
            ret = await psql_command.PSQL(self.config, action=self.prepare_action).run()
            if ret != 0:
                print(f'action failed; aborting tests')
                exit(1)

        self.psql = await asyncpg.connect(
            user=self.config['database']['user'],
            password=self.config['database']['password'],
            host=self.config['database']['host'],
            database=self.config['database']['dbname']
        )

        self.psql.add_termination_listener(self.terminate_callback)
        self.psql.add_log_listener(self.log_callback)

        # for testing purposes, reduce the number of rounds for bf
        await self.fetch("insert into password_setting (algorithm, rounds) values ('bf', 4);")

        from . import websocket_connections
        print(f'{util.BOLD}websocket_connections.test{util.NORMAL}')
        await websocket_connections.test(self)

        from . import user_accounts
        print(f'{util.BOLD}user_accounts.test{util.NORMAL}')
        await user_accounts.test(self)

        from . import subscriptions
        print(f'{util.BOLD}subscriptions.test{util.NORMAL}')
        await subscriptions.test(self)

        from . import groups
        print(f'{util.BOLD}groups.test{util.NORMAL}')
        await groups.test(self)

        from . import group_data
        print(f'{util.BOLD}group_data.test{util.NORMAL}')
        await group_data.test(self)

        await self.fetch("delete from password_setting where algorithm = 'bf' and rounds = 4;")

        print(f'{util.BOLD}tests done{util.NORMAL}')

        if self.populate_db:
            print(f'{util.BOLD}populating db with test data{util.NORMAL}')
            from .import populate
            await populate.populate(self)

        self.done = True

    async def fetch(self, query, *args, columns=None, rowcount=None):
        """
        runs the given query, with the given args.
        if columns is [None], ensures that the result has exactly one column.
        if columns is a list of strings, ensures that the result has exactly these columns.
        if rowcount is not None, ensures that the result has exactly this many rows.
        """
        try:
            result = await self.psql.fetch(query, *args, timeout=10)
        except Exception as exc:
            self.error(f"query failed:\n{query!r}\n{exc!r}")
            raise

        if result and columns is not None:
            keys = list(result[0].keys())
            if columns == [None]:
                if len(result[0]) != 1:
                    self.error(f"expected a single column, but got {keys!r}")
            elif columns != keys:
                self.error(f"expected column(s) {columns!r}, but got {keys!r}")

        if rowcount not in (None, len(result)):
            self.error(f"expected {rowcount} rows, but got {len(result)} rows")

        return result

    async def fetch_expect_error(self, query, *args, error=Exception, error_re=None):
        """
        runs the given query, with the given args.
        expects that the query will fail with a certain error.
        """
        try:
            result = await self.psql.fetch(query, *args, timeout=10)
        except error as exc:
            if error_re is not None:
                if re.search(error_re, str(exc)) is None:
                    self.error(
                        f'expected {query=!r}\n'
                        f'to fail with {error!r} matching {error_re!r}\n'
                        f'but it failed with {type(exc)!s}\n'
                        f'{exc!s}'
                    )
        except BaseException as exc:
            self.error(
                f'expected {query=!r}\n'
                f'to fail with {error!r}\n'
                f'but it failed with {type(exc)!s}\n'
                f'{exc!s}'
            )
        else:
            self.error(f"expected {query=!r}\nto fail, but it returned\n{result!r}")

    async def fetch_expect_raise(self, query, *args, error_id=None):
        """
        runs the given query, with the given args.
        expects that the query will raise an exception with
        an error description that matches the given error id (up to the first ':')
        """
        await self.fetch_expect_error(
            query,
            *args,
            error=asyncpg.exceptions.RaiseError,
            error_re=f'^{error_id}:'
        )

    async def fetchrow(self, query, *args, columns=None, expect=None):
        """
        runs fetch and extracts the single row,
        checking columns.

        expect can be a tuple to compare all row values against by ==,
        you may wrap it with the compare module functions.
        """
        rows = await self.fetch(query, *args, columns=columns, rowcount=1)
        row = rows[0]

        if expect is not None:
            self.expect(row, expect)

        return row

    async def fetchvals(self, query, *args, column=None, rowcount=None):
        """
        runs fetch and extracts the values of a single column as a list,
        checking the column name.
        """
        rows = await self.fetch(query, *args, columns=[column], rowcount=rowcount)
        return [row[0] for row in rows]

    async def fetchval(self, query, *args, column=None, expect=...):
        """
        runs fetchrow and extracts the single value

        expect can be an expected value, usually wrapped with the compare module functions.
        """
        val = (await self.fetchrow(query, *args, columns=[column]))[0]

        if expect is not ...:
            self.expect(val, expect)

        return val

    async def listen(self, channel_name):
        """
        subscribes to a notification channel;
        the notifications will be put into self.notifications
        """
        await self.psql.add_listener(channel_name, self.notification_callback)

    async def unlisten(self, channel_name):
        """
        unsubscribes form a notification channel
        """
        await self.psql.remove_listener(channel_name, self.notification_callback)

    def notification_callback(self, connection, pid, channel, payload):
        """
        runs whenever we get a psql notification.
        enqueues (channel, payload).
        """
        self.expect(connection, compare.identical(self.psql))
        del pid  # unused
        try:
            payload_json = json.loads(payload)
        except json.JSONDecodeError as exc:
            print(f'notification on {channel!r}: '
                  f'invalid json: {payload!r}')
            raise
        print(f'notification on {channel!r}: {payload_json!r}')
        self.notifications.put_nowait((channel, payload_json))

    async def get_notification(self, ensure_single=True):
        """
        returns the current next notification as (channel, payloaddict)

        if ensure_single, ensures that there are no further notifications
        in the queue.
        """
        try:
            notification = await asyncio.wait_for(self.notifications.get(), timeout=0.1)
        except asyncio.exceptions.TimeoutError:
            self.error('expected a notification but did not receive it')
        if ensure_single:
            await self.expect_no_notification()
        return notification

    async def get_notifications(self, count):
        """
        returns the given number of notifications as [(channel, payload), ...]
        """
        ret = list()
        for _ in range(count):
            try:
                ret.append(await asyncio.wait_for(self.notifications.get(), timeout=0.1))
            except asyncio.exceptions.TimeoutError:
                self.error('expected notification within 0.1s')
        await self.expect_no_notification()
        return ret

    async def expect_no_notification(self, waittime=0.05):
        """
        when called, throws an error when there are notifications within given time.
        """
        # wait a bit for notifications to arrive
        # if we only had some way of knowing there are pending notfications...
        await asyncio.sleep(waittime)
        extra_notifications = []
        while self.notifications.qsize() > 0:
            extra_notifications.append(self.notifications.get_nowait())
        if extra_notifications:
            self.error(
                f'expected only one notification, but got:\n{notification!r}\n' +
                '\n'.join(repr(x) for x in extra_notifications)
            )

    def notification_count(self):
        """ return how many notifications are to be processed """
        return self.notifications.qsize()

    def terminate_callback(self, connection):
        """ runs when the psql connection is closed """
        self.expect(connection, compare.identical(self.psql))
        if not self.done:
            self.error('psql connection closed unexpectedly')

    async def log_callback(self, connection, message):
        """ runs when psql sends a log message """
        self.expect(connection, compare.identical(self.psql))
        print(f'psql log message: {message}')

    def error(self, error_message):
        """
        Call this to indicate an error during testing.
        """
        print(f'{util.format_error("test error")} {error_message}')
        raise RuntimeError(error_message) from None

    def expect(self, actual, expected):
        """
        Tests that actual == expected, calls self.error if not, and returns actual.
        You can use this in combination with the compare module.
        """

        if not (expected == actual):
            if (isinstance(expected, (list, tuple))):
                for idx, (exp, act) in enumerate(zip(expected, actual)):
                    if not (exp == act):
                        self.error(f"when comparing index {idx}, "
                                   f"expected {exp!r}, but got {act!r}")
            else:
                self.error(f"expected {expected!r}, but got {actual!r}")
        return actual

    def expect_random(self, actual_iterable, expected_iterable):
        """
        when actual_iterable has unforseeable order,
        use this function to map all expected values to the actual ones.
        """
        used_idx = set()
        for expected in expected_iterable:
            found = False
            found_idxreuse = False
            for idx, actual in enumerate(actual_iterable):
                if expected == actual:
                    if idx in used_idx:
                        found_idxreuse = True
                    else:
                        used_idx.add(idx)
                        found = True
            if not found:
                if found_idxreuse:
                    self.error(f"could not find another instance of {expected!r} in {actual_iterable!r}")
                else:
                    self.error(f"could not find expected {expected!r} in {actual_iterable!r}")
