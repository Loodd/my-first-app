import { Probot } from "probot";
const commands = require('probot-commands')

export = (app: Probot) => {
  app.on("issues.opened", async (context) => {

    const issueComment = context.issue({
      body: `Thanks for opening this issue! ${JSON.stringify(context)}`
    });

    await context.octokit.issues.createComment(issueComment);
  });

  // Type `/label foo, bar` in a comment box for an Issue or Pull Request
  commands(app, 'label', (context: any, command: any) => {
    const labels = command.arguments.split(/, */);
    return context.github.issues.addLabels(context.issue({labels}));
  });
};
