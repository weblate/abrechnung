import {
    BalanceHistoryEntry,
    computeAccountBalanceHistory,
    computeAccountBalances,
    getTransactionSortFunc,
    TransactionSortMode,
} from "@abrechnung/core";
import { AccountBalanceMap, Transaction } from "@abrechnung/types";
import { fromISOString } from "@abrechnung/utils";
import memoize from "proxy-memoize";
import {
    selectAccountIdToNameMapInternal,
    selectGroupAccountsFilteredInternal,
    selectGroupAccountsInternal,
} from "./accounts";
import {
    selectGroupPositionsInternal,
    selectGroupTransactionsInternal,
    selectTransactionBalanceEffectsInternal,
} from "./transactions";
import { IRootState } from "./types";

const selectAccountBalancesInternal = (args: { state: IRootState; groupId: number }): AccountBalanceMap => {
    const { state, groupId } = args;
    const transactions = selectGroupTransactionsInternal({ state: state.transactions, groupId });
    const positions = selectGroupPositionsInternal({ state: state.transactions, groupId });
    const accounts = selectGroupAccountsInternal({ state: state.accounts, groupId });
    return computeAccountBalances(accounts, transactions, positions);
};

export const selectAccountBalances = memoize(selectAccountBalancesInternal);

export const selectAccountBalanceHistory = memoize(
    (args: { state: IRootState; groupId: number; accountId: number }): BalanceHistoryEntry[] => {
        const { state, groupId, accountId } = args;
        const transactions = selectGroupTransactionsInternal({ state: state.transactions, groupId });
        const clearingAccounts = selectGroupAccountsFilteredInternal({
            state: state.accounts,
            groupId,
            type: "clearing",
        });
        const balances = selectAccountBalancesInternal({ state, groupId });
        const balanceEffects = selectTransactionBalanceEffectsInternal({ state: state.transactions, groupId });
        return computeAccountBalanceHistory(accountId, clearingAccounts, balances, transactions, balanceEffects);
    }
);

export const selectCurrentUserPermissions = memoize(
    (args: { state: IRootState; groupId: number }): { isOwner: boolean; canWrite: boolean } | undefined => {
        const { state, groupId } = args;
        if (state.auth.profile === undefined) {
            return undefined;
        }

        const userId = state.auth.profile.id;

        if (
            state.groups.byGroupId[groupId] === undefined ||
            state.groups.byGroupId[groupId].groupMembersStatus !== "initialized"
        ) {
            return undefined;
        }
        const member = state.groups.byGroupId[groupId].groupMembers.byId[userId];
        if (member === undefined) {
            return undefined;
        }
        return {
            isOwner: member.isOwner,
            canWrite: member.canWrite,
        };
    }
);

export const selectTagsInGroup = memoize((args: { state: IRootState; groupId: number }): string[] => {
    const { state, groupId } = args;
    const transactions = selectGroupTransactionsInternal({ state: state.transactions, groupId });
    const clearingAccounts = selectGroupAccountsFilteredInternal({
        state: state.accounts,
        groupId,
        type: "clearing",
    });

    const transactionTags = transactions.map((t) => t.tags).flat();
    const accountTags = clearingAccounts.map((a) => (a.type === "clearing" ? a.tags : [])).flat();
    return Array.from(new Set([...transactionTags, ...accountTags])).sort((a, b) =>
        a.toLowerCase().localeCompare(b.toLowerCase())
    );
});

export const selectSortedTransactions = memoize(
    (args: {
        state: IRootState;
        groupId: number;
        sortMode: TransactionSortMode;
        searchTerm?: string;
        tags?: string[];
    }): Transaction[] => {
        const { state, groupId, sortMode, searchTerm, tags = [] } = args;
        const balanceEffects = selectTransactionBalanceEffectsInternal({ state: state.transactions, groupId });
        const transactions = selectGroupTransactionsInternal({ state: state.transactions, groupId });
        const accountMap = selectAccountIdToNameMapInternal({ state: state.accounts, groupId });
        const compareFunction = getTransactionSortFunc(sortMode);
        // TODO: this has optimization potential
        const filterFn = (t: Transaction): boolean => {
            if (tags.length > 0 && t.tags) {
                for (const tag of tags) {
                    if (!t.tags.includes(tag)) {
                        return false;
                    }
                }
            }

            if (searchTerm && searchTerm !== "") {
                if (
                    t.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    fromISOString(t.billedAt).toDateString().toLowerCase().includes(searchTerm.toLowerCase()) ||
                    fromISOString(t.lastChanged).toDateString().toLowerCase().includes(searchTerm.toLowerCase()) ||
                    String(t.value).includes(searchTerm.toLowerCase())
                ) {
                    return true;
                }

                return Object.keys(balanceEffects[t.id]).reduce((acc: boolean, curr: string): boolean => {
                    return acc || accountMap[Number(curr)].toLowerCase().includes(searchTerm.toLowerCase());
                }, false);
            }

            return true;
        };

        return transactions.filter(filterFn).sort(compareFunction);
    }
);
