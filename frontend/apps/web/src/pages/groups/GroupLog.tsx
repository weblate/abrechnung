import React, { useState } from "react";
import { useRecoilValue } from "recoil";
import { Group, groupLog, groupMembers } from "../../state/groups";
import { sendGroupMessage } from "../../core/api";
import { toast } from "react-toastify";
import { DateTime } from "luxon";
import {
    Button,
    Divider,
    FormControlLabel,
    List,
    ListItem,
    ListItemText,
    Switch,
    TextField,
    Typography,
} from "@mui/material";
import { MobilePaper } from "../../components/style/mobile";
import { useTitle } from "../../core/utils";

interface Props {
    group: Group;
}

export const GroupLog: React.FC<Props> = ({ group }) => {
    const [message, setMessage] = useState("");
    const [showAllLogs, setShowAllLogs] = useState(false);
    const logEntries = useRecoilValue(groupLog(group.id));
    const members = useRecoilValue(groupMembers(group.id));

    useTitle(`${group.name} - Log`);

    const sendMessage = () => {
        sendGroupMessage({
            groupID: group.id,
            message: message,
        })
            .then((result) => {
                setMessage("");
            })
            .catch((err) => {
                toast.error(err);
            });
    };

    const getMemberUsername = (member_id) => {
        const member = members.find((member) => member.user_id === member_id);
        if (member === undefined) {
            return "unknown";
        }
        return member.username;
    };

    const onKeyUp = (key) => {
        key.preventDefault();
        if (key.keyCode === 13) {
            sendMessage();
        }
    };

    const log = showAllLogs ? logEntries : logEntries.filter((entry) => entry.type === "text-message");

    return (
        <MobilePaper>
            <Typography component="h3" variant="h5">
                Group Log
            </Typography>
            <FormControlLabel
                control={
                    <Switch
                        name="showAllLogs"
                        checked={showAllLogs}
                        color="primary"
                        onChange={(e) => setShowAllLogs(e.target.checked)}
                    />
                }
                label="Show all Logs"
            />
            <TextField
                required
                fullWidth
                name="newMessage"
                placeholder="Write a message to the group ..."
                value={message}
                variant="outlined"
                onKeyUp={onKeyUp}
                multiline
                onChange={(e) => setMessage(e.target.value)}
            />
            <Button type="submit" color="primary" onClick={sendMessage}>
                Send
            </Button>
            <Divider variant="middle" />
            <List>
                {log.map((logEntry) => (
                    <ListItem key={logEntry.id}>
                        <ListItemText
                            primary={`${logEntry.type} - ${logEntry.message}`}
                            secondary={`by ${getMemberUsername(logEntry.user_id)}
                            on ${DateTime.fromISO(logEntry.logged_at).toLocaleString(DateTime.DATETIME_FULL)}`}
                        />
                    </ListItem>
                ))}
            </List>
        </MobilePaper>
    );
};

export default GroupLog;
