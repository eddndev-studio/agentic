use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum IncomingMessage {
    /// A brand new message from WhatsApp/Telegram received by the Gateway
    #[serde(rename = "NEW_MESSAGE")]
    NewMessage {
        bot_id: String,
        session_id: String,
        identifier: String,
        platform: String,
        from_me: bool,
        sender: String,
        message: MessageContent,
    },
    /// A request from the Gateway (API/Cron) to execute a specific step in a Flow
    #[serde(rename = "EXECUTE_STEP")]
    ExecuteStep {
        execution_id: String,
        step_id: String,
    },
    /// A request to schedule step processing for an execution (used by manual flow execution from the API)
    #[serde(rename = "SCHEDULE_STEP")]
    ScheduleStep {
        execution_id: String,
        step_order: i32,
    },
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MessageContent {
    pub text: Option<String>,
    #[serde(rename = "mediaUrl")]
    pub media_url: Option<String>,
    pub timestamp: i64,
}
