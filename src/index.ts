import { Probot } from "probot";

class Command {
  constructor (private name: any, private callback: any) {
    this.name = name
    this.callback = callback
  }

  listener (context: any) {
    const {comment, issue, pull_request: pr} = context.payload

    const command = (comment || issue || pr).body.match(this.matcher)

    if (command && this.name === command[1]) {
      return this.callback(context, {name: command[1], arguments: command[2]})
    }
  }
}

export = (app: Probot) => {
  app.on("issues.opened", async (context) => {

    const issueComment = context.issue({
      body: `Thanks for opening this issue! ${JSON.stringify(context)}`
    });

    await context.octokit.issues.createComment(issueComment);
  });

  app.on('issue_comment.created', async (context) => {
    var matcher = /^\/([\w]+)\b *(.*)?$/m;

    var message = context.payload.comment;

    const command = message.body.match(matcher);

    if (command != null && command[1] == "address") {
      const issueComment = context.issue({
        body: `Addres: ${JSON.stringify(command)}`
      });
  
      await context.octokit.issues.createComment(issueComment);
    }
  });
};
