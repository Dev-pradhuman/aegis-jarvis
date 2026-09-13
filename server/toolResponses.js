export function formatToolReply(result, input = {}) {
  if (result.status === 'waiting_for_approval') return `Approval required: ${result.approval?.title || result.toolName}. Approve it before ${result.approval?.expiresAt || 'it expires'} to execute this exact action.`;
  if (result.status === 'waiting_for_clarification') {
    const candidates = result.pendingIntent?.candidates || [];
    return `I found ${candidates.length} ${input.platform || ''} contacts named ${input.contact}:\n${candidates.map((candidate, index) => `${index + 1}. ${candidate.displayName || candidate.username || 'Unknown'}${candidate.username && candidate.username !== candidate.displayName ? ` — @${candidate.username}` : ''}${candidate.disambiguationMetadata ? ` — ${candidate.disambiguationMetadata}` : ''}`).join('\n')}\nWhich one?`;
  }
  if (result.status !== 'completed') return `${result.error?.code || 'EXECUTION_FAILED'}: ${result.error?.message || 'Tool execution failed.'}`;
  const output = result.output || {};
  switch (result.toolName) {
    case 'tasks.list': return output.tasks.length ? `You have ${output.tasks.length} task${output.tasks.length === 1 ? '' : 's'}.` : 'You have no tasks.';
    case 'tasks.create': return `Done. “${output.task.title}” was added to Tasks.`;
    case 'tasks.update': return `Task updated: ${output.task.title}.`;
    case 'memory.search': return output.memories.length ? `I found ${output.memories.length} relevant memory record${output.memories.length === 1 ? '' : 's'}.` : 'I did not find relevant stored memory.';
    case 'memory.store': return 'Memory stored.';
    case 'contacts.list': return output.contacts.length ? `${output.contacts.length} contacts are saved in your local library.` : 'Your contact library is empty.';
    case 'contacts.resolve': return output.availablePlatforms.length ? `${output.contact.name} is available on ${output.availablePlatforms.join(', ')}.` : `${output.contact.name} is saved, but no platform address has been added yet.`;
    case 'contacts.upsert': return `${output.contact.name} was saved to your local contact library.`;
    case 'contacts.delete': return 'Contact deleted.';
    case 'communication.send': return `${output.platform} acknowledged the message to ${output.contactName}.`;
    case 'runtime.telemetry': return `Using ${output.provider?.label || output.provider?.id || 'the configured provider'} with model ${output.provider?.model || output.modelRoute?.finalModel || 'not configured'}.`;
    case 'diagnostics': return `JARVIS service is ${output.service}; persistence is ${output.persistence}.`;
    case 'browser.external.open': return `${input.label || output.label || 'The requested page'} was opened in ${output.browser?.name || 'your default browser'}.`;
    case 'browser.open': return `${input.label || output.label || 'The requested page'} is open in the managed browser.`;
    case 'youtube.play': return `${output.title || input.query} is playing on YouTube.`;
    case 'youtube_music.play': return `${output.title || input.query} is playing on YouTube Music.`;
    case 'system.app.open': return `${output.label || input.app} is open.`;
    case 'system.resources': return `CPU usage is ${output.cpuPercent ?? 'unavailable'}% and RAM usage is ${output.memory?.usedPercent ?? 'unavailable'}%.`;
    case 'computer.type': case 'computer.keypress': return 'Input was delivered to the specified window. Its application-level effect has not been read back.';
    case 'mouse.click': case 'mouse.double_click': case 'mouse.right_click': case 'mouse.scroll': case 'mouse.drag': return 'Pointer input was delivered inside the specified window. Its application-level effect has not been observed.';
    case 'clipboard.write': return 'Clipboard text updated and read back for verification.';
    case 'clipboard.read': return 'Clipboard text was read. It is excluded from Run history.';
    case 'windows.get_active': return output.active ? `Active window: ${output.active.title}.` : 'No active application window was observed.';
    case 'files.read': return `${output.path} is ${output.bytes} bytes and was read from the project workspace.`;
    case 'gmail.latest': return output.emails.length ? `Your latest ${output.emails.length} inbox email${output.emails.length === 1 ? '' : 's'}:\n${output.emails.map((email, index) => `${index + 1}. ${email.subject || '(no subject)'} — ${email.sender || 'Unknown sender'}${email.messageTimestamp ? ` (${new Date(email.messageTimestamp).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })})` : ''}`).join('\n')}` : 'Your Gmail inbox has no matching emails.';
    case 'gmail.search': { const items=output.data?.messages||output.data?.items||output.messages||[];return Array.isArray(items)&&items.length?`I found ${items.length} matching Gmail message${items.length===1?'':'s'}.`:'No unread Gmail messages were found.'; }
    case 'instagram.messages.latest': {
      const shown = output.presentationMessages || output.incomingMessages || output.messages || [];
      if (output.syncStatus === 'incremental' && !shown.length) return 'No new Instagram messages since I last checked.';
      if (!shown.length) return output.directionReliable ? 'Instagram returned no recent incoming messages.' : 'Instagram is connected and returned no recent messages.';
      const grouped = [];
      for (const message of shown) { const sender = message.sender || message.username || message.senderId || 'Unknown sender'; let group = grouped.find((item) => item.sender === sender); if (!group) { group = { sender, messages: [] }; grouped.push(group); } group.messages.push(message); }
      const describe = (message) => {
        if (message.contentType === 'text' || message.text) return message.text ? `sent a message: “${message.text}”` : 'sent a message.';
        return ({ reel: 'shared a reel.', shared_reel: 'shared a reel.', post: 'shared a post.', shared_post: 'shared a post.', image: 'sent an image.', video: 'sent a video.', voice: 'sent a voice message.', audio: 'sent a voice message.', story_reply: 'replied to your story.', reaction: 'reacted to your message.', link: 'sent a link.', sticker: 'sent a sticker.', attachment: 'sent an attachment.' })[message.contentType] || 'sent an attachment.';
      };
      const lines = grouped.map((group) => group.messages.length === 1 ? `${group.sender} ${describe(group.messages[0])}` : group.messages.every((message) => message.text) ? `${group.sender} sent ${group.messages.length} messages:\n${group.messages.map((message) => `“${message.text}”`).join('\n')}` : `${group.sender} sent ${group.messages.length} items:\n${group.messages.map((message) => describe(message)).join('\n')}`);
      const prefix = output.syncStatus === 'baseline' ? 'Instagram does not expose reliable unread status. Here are the latest incoming messages:\n\n' : `I found ${shown.length} new incoming message${shown.length === 1 ? '' : 's'} since I last checked:\n\n`;
      return `${prefix}${lines.join('\n\n')}`;
    }
    case 'media.generate': return output.media.status === 'completed' ? `Generated your ${output.media.kind} with ${output.media.model}.` : `Started ${output.media.kind} generation with ${output.media.model}. Job ${output.media.id} is processing.`;
    case 'command.execute': return `Command completed with exit code ${output.code}.`;
    case 'research.search': return `Research returned ${output.sources.length} attributed source${output.sources.length === 1 ? '' : 's'}.`;
    case 'messages.send': return `Message delivery confirmed by ${output.provider || 'the configured provider'}.`;
    case 'calendar.create': return 'Calendar/reminder provider confirmed the event.';
    case 'communications.call.start': case 'communications.call.answer': case 'communications.call.reject': case 'communications.message.send': return output.message || `Voice OS action confirmed: ${output.state}.`;
    case 'workflows.list': return `You have ${output.workflows.length} workflow${output.workflows.length === 1 ? '' : 's'}.`;
    case 'workflows.run': return `Workflow ${output.run.status || output.run.state}.`;
    default: return `${result.toolName} completed and verification passed.`;
  }
}
