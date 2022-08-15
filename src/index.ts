import { Probot } from "probot";


class Command {
  constructor (private name: any, private callback: any) {
    this.name = name
    this.callback = callback
  }

  get matcher () {
    return /^\/([\w]+)\b *(.*)?$/m
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

  const command = new Command('label', (context: any, command: any) => {
    const labels = command.arguments.split(/, */);
    return context.github.issues.addLabels(context.issue({labels}));
  })

  app.on('issue_comment.created', command.listener.bind(command));
  app.on('issues.opened', command.listener.bind(command));
  app.on('pull_request.opened', command.listener.bind(command));
};
