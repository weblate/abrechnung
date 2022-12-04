import {
    Button,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Grid,
    IconButton,
    LinearProgress,
} from "@mui/material";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import { ChevronLeft, Delete, Edit } from "@mui/icons-material";
import React, { useState } from "react";
import { api } from "../../core/api";
import { toast } from "react-toastify";
import { useAppSelector, selectTransactionSlice, useAppDispatch } from "../../store";
import {
    deleteTransaction,
    discardTransactionChange,
    saveTransaction,
    selectTransactionById,
    transactionEditStarted,
    selectCurrentUserPermissions,
} from "@abrechnung/redux";

interface Props {
    groupId: number;
    transactionId: number;
}

export const TransactionActions: React.FC<Props> = ({ groupId, transactionId }) => {
    const [confirmDeleteDialogOpen, setConfirmDeleteDialogOpen] = useState(false);
    const [showProgress, setShowProgress] = useState(false);

    const navigate = useNavigate();
    const permissions = useAppSelector((state) => selectCurrentUserPermissions({ state: state, groupId }));

    const transaction = useAppSelector((state) =>
        selectTransactionById({ state: selectTransactionSlice(state), groupId, transactionId })
    );
    const dispatch = useAppDispatch();

    const edit = () => {
        if (!transaction.isWip) {
            dispatch(transactionEditStarted({ groupId, transactionId }));
        }
    };

    const abortEdit = () => {
        if (!transaction.isWip) {
            toast.error("Cannot save as there are not changes made");
            return;
        }
        setShowProgress(true);
        dispatch(discardTransactionChange({ groupId, transactionId, api }))
            .unwrap()
            .then(({ deletedTransaction }) => {
                setShowProgress(false);
                if (deletedTransaction) {
                    navigate(`/groups/${groupId}/`);
                }
            })
            .catch((err) => {
                setShowProgress(false);
                toast.error(`error while cancelling edit: ${err.toString()}`);
            });
    };

    const commitEdit = () => {
        if (!transaction.isWip) {
            toast.error("Cannot cancel editing as there are not changes made");
            return;
        }
        setShowProgress(true);
        dispatch(saveTransaction({ groupId, transactionId, api }))
            .unwrap()
            .then(({ oldTransactionId, transactionContainer }) => {
                setShowProgress(false);
                if (oldTransactionId !== transactionContainer.transaction.id) {
                    navigate(`/groups/${groupId}/transactions/${transactionContainer.transaction.id}?no-redirect=true`);
                }
            })
            .catch((err) => {
                setShowProgress(false);
                toast.error(`error while saving transaction: ${err.toString()}`);
            });
    };

    const confirmDeleteTransaction = () => {
        setShowProgress(true);
        dispatch(deleteTransaction({ groupId, transactionId, api }))
            .unwrap()
            .then(() => {
                setShowProgress(false);
                navigate(`/groups/${groupId}/`);
            })
            .catch((err) => {
                setShowProgress(false);
                toast.error(`error while deleting transaction: ${err.toString()}`);
            });
    };

    const transactionTypeLabel = transaction.type === "purchase" ? "purchase" : "transfer";

    return (
        <>
            <Grid container justifyContent="space-between">
                <Grid item sx={{ display: "flex", alignItems: "center" }}>
                    <IconButton
                        sx={{ display: { xs: "none", md: "inline-flex" } }}
                        component={RouterLink}
                        to={`/groups/${groupId}/`}
                    >
                        <ChevronLeft />
                    </IconButton>
                    <Chip color="primary" label={transactionTypeLabel} />
                </Grid>
                <Grid item>
                    {permissions.canWrite && (
                        <>
                            {transaction.isWip ? (
                                <>
                                    <Button color="primary" onClick={commitEdit}>
                                        Save
                                    </Button>
                                    <Button color="error" onClick={abortEdit}>
                                        Cancel
                                    </Button>
                                </>
                            ) : (
                                <IconButton color="primary" onClick={edit}>
                                    <Edit />
                                </IconButton>
                            )}
                            <IconButton color="error" onClick={() => setConfirmDeleteDialogOpen(true)}>
                                <Delete />
                            </IconButton>
                        </>
                    )}
                </Grid>
            </Grid>
            {showProgress && <LinearProgress />}
            <Dialog maxWidth="xs" aria-labelledby="confirmation-dialog-title" open={confirmDeleteDialogOpen}>
                <DialogTitle id="confirmation-dialog-title">Confirm delete transaction</DialogTitle>
                <DialogContent dividers>
                    Are you sure you want to delete the transaction &quot{transaction.description}&quot
                </DialogContent>
                <DialogActions>
                    <Button autoFocus onClick={() => setConfirmDeleteDialogOpen(false)} color="primary">
                        Cancel
                    </Button>
                    <Button onClick={confirmDeleteTransaction} color="error">
                        Ok
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
};

export default TransactionActions;
