use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct ConditionalTimeMetadata {
    pub branches: Vec<TimeBranch>,
    pub fallback: Option<BranchContent>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TimeBranch {
    #[serde(rename = "startTime")]
    pub start_time: String,
    #[serde(rename = "endTime")]
    pub end_time: String,

    // Inline BranchContent fields
    pub r#type: String,
    pub content: Option<String>,
    #[serde(rename = "mediaUrl")]
    pub media_url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BranchContent {
    pub r#type: String,
    pub content: Option<String>,
    #[serde(rename = "mediaUrl")]
    pub media_url: Option<String>,
}

/// Helper struct for outgoing messages (to queue `agentic:queue:outgoing`)
#[derive(Debug, Serialize, Deserialize)]
pub struct OutgoingMessage {
    pub bot_id: String,
    pub target: String,
    pub execution_id: String,
    pub step_order: i32,
    pub payload: OutgoingPayload,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OutgoingPayload {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub image: Option<MediaPayload>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub audio: Option<MediaPayload>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub caption: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub ptt: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MediaPayload {
    pub url: String,
}
