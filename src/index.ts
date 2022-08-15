import { Probot } from "probot";

export = (app: Probot) => {
  app.on("issues.opened", async (context) => {

    const issueComment = context.issue({
      body: `Thanks for opening this issue! ${JSON.stringify(context)}`
    });

    await context.octokit.issues.createComment(issueComment);
  });

  app.on('issue_comment.created', async (context) => {
    const issueComment = context.issue({
      body: `Addres: ${JSON.stringify(context.payload)}`
    });

    await context.octokit.issues.createComment(issueComment);

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
