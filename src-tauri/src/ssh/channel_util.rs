use russh::client;
use russh::{Channel, ChannelMsg};

use crate::error::{AxionError, AxionResult};

/// After a channel request with `want_reply: true`, drain until Success/Failure.
pub async fn wait_channel_request(channel: &mut Channel<client::Msg>) -> AxionResult<()> {
    loop {
        match channel.wait().await {
            Some(ChannelMsg::Success) => return Ok(()),
            Some(ChannelMsg::Failure) => {
                return Err(AxionError::from("remote rejected channel request"));
            }
            Some(_) => continue,
            None => return Err(AxionError::from("channel closed before ready")),
        }
    }
}
