import { balanceColor } from "@/core/utils";
import { useAppSelector } from "@/store";
import { BalanceChangeOrigin } from "@abrechnung/core";
import {
    selectAccountBalanceHistory,
    selectAccountIdToAccountMap,
    selectTransactionByIdMap,
    useGroupCurrencySymbol,
} from "@abrechnung/redux";
import { fromISOString, toISODateString } from "@abrechnung/utils";
import { Card, Divider, Theme, Typography, useTheme } from "@mui/material";
import { PointMouseHandler, PointTooltipProps, ResponsiveLine, Serie } from "@nivo/line";
import { DateTime } from "luxon";
import React from "react";
import { useNavigate } from "react-router-dom";
import { ClearingAccountIcon, PurchaseIcon, TransferIcon } from "../style/AbrechnungIcons";

interface Props {
    groupId: number;
    accountId: number;
}

export const BalanceHistoryGraph: React.FC<Props> = ({ groupId, accountId }) => {
    const theme: Theme = useTheme();
    const navigate = useNavigate();

    const currency_symbol = useGroupCurrencySymbol(groupId);
    const transactionMap = useAppSelector((state) => selectTransactionByIdMap(state, groupId));
    const accounts = useAppSelector((state) => selectAccountIdToAccountMap(state, groupId));
    const balanceHistory = useAppSelector((state) => selectAccountBalanceHistory(state, groupId, accountId));

    const { graphData, seriesColors, areaBaselineValue } = React.useMemo(() => {
        const { hasNegativeEntries, hasPositiveEntries, max, min } = balanceHistory.reduce(
            (acc, curr) => {
                const neg = curr.balance < 0;
                const pos = curr.balance >= 0;
                return {
                    hasNegativeEntries: acc.hasNegativeEntries || neg,
                    hasPositiveEntries: acc.hasPositiveEntries || pos,
                    max: Math.max(curr.balance, acc.max),
                    min: Math.min(curr.balance, acc.min),
                };
            },
            { hasNegativeEntries: false, hasPositiveEntries: false, max: -Infinity, min: Infinity }
        );

        const areaBaselineValue =
            balanceHistory.length === 0 ? undefined : !hasNegativeEntries ? min : !hasPositiveEntries ? max : undefined;

        const graphData: Serie[] = [];
        let lastPoint = balanceHistory[0];
        const makeSerie = (): {
            id: string;
            data: Array<{ x: Date; y: number; changeOrigin: BalanceChangeOrigin }>;
        } => {
            return {
                id: `serie-${graphData.length}`,
                data: [],
            };
        };
        let currentSeries = makeSerie();
        for (const entry of balanceHistory) {
            if (lastPoint === undefined) {
                break;
            }
            const hasDifferentSign = Math.sign(lastPoint.balance) !== Math.sign(entry.balance);
            currentSeries.data.push({
                x: fromISOString(entry.date),
                y: entry.balance,
                changeOrigin: entry.changeOrigin,
            });
            if (hasDifferentSign) {
                graphData.push(currentSeries);
                currentSeries = makeSerie();
                currentSeries.data.push({
                    x: fromISOString(entry.date),
                    y: entry.balance,
                    changeOrigin: entry.changeOrigin,
                });
            }
            lastPoint = entry;
        }
        if (balanceHistory.length > 0) {
            graphData.push(currentSeries);
        }
        const seriesColors: string[] = graphData.map((serie) =>
            Number(serie.data[0].y) >= 0 ? theme.palette.success.main : theme.palette.error.main
        );

        return { graphData, seriesColors, areaBaselineValue };
    }, [balanceHistory, theme]);

    const onClick: PointMouseHandler = (point, event) => {
        const changeOrigin: BalanceChangeOrigin = (point.data as any).changeOrigin;
        if (changeOrigin.type === "clearing") {
            navigate(`/groups/${groupId}/accounts/${changeOrigin.id}`);
        } else {
            navigate(`/groups/${groupId}/transactions/${changeOrigin.id}`);
        }
    };

    const renderTooltip: React.FC<PointTooltipProps> = ({ point }) => {
        const changeOrigin: BalanceChangeOrigin = (point.data as any).changeOrigin;

        const icon =
            changeOrigin.type === "clearing" ? (
                <ClearingAccountIcon color="primary" sx={{ fontSize: theme.typography.fontSize }} />
            ) : transactionMap[changeOrigin.id].type === "purchase" ? (
                <PurchaseIcon color="primary" sx={{ fontSize: theme.typography.fontSize }} />
            ) : (
                <TransferIcon color="primary" sx={{ fontSize: theme.typography.fontSize }} />
            );

        return (
            <Card sx={{ padding: 2 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <Typography variant="body1" component="span">
                        {DateTime.fromJSDate(point.data.x as Date).toISODate()}
                    </Typography>
                    <Typography
                        component="span"
                        sx={{
                            color: (theme) => balanceColor(point.data.y as number, theme),
                            ml: 2,
                        }}
                    >
                        {(point.data.y as number).toFixed(2)} {currency_symbol}
                    </Typography>
                </div>
                <Divider />
                {changeOrigin.type === "clearing" ? (
                    <Typography variant="body1">
                        {icon} {accounts[changeOrigin.id].name}
                    </Typography>
                ) : (
                    <Typography variant="body1">
                        {icon} {transactionMap[changeOrigin.id].name}
                    </Typography>
                )}
            </Card>
        );
    };

    return (
        <div style={{ width: "100%", height: "300px" }}>
            <ResponsiveLine
                curve="stepAfter"
                data={graphData}
                margin={{ top: 50, right: 50, bottom: 50, left: 60 }}
                xScale={{ type: "time", precision: "day", format: "native" }}
                yScale={{ type: "linear", min: "auto", max: "auto" }}
                colors={seriesColors}
                areaBaselineValue={areaBaselineValue}
                tooltip={renderTooltip}
                onClick={onClick}
                pointLabel={(p) => `${toISODateString(p.data.x as Date)}: ${p.data.y}`}
                useMesh={true}
                axisLeft={{
                    format: (value: number) => `${value.toFixed(2)} ${currency_symbol}`,
                }}
                axisBottom={{
                    tickValues: 4,
                    format: (value: Date) => toISODateString(value),
                }}
                enableArea={true}
                areaOpacity={0.07}
            />
        </div>
    );
};
