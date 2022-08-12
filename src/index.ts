import { Probot } from "probot";
import MD5 from "crypto-js/md5";

export = (app: Probot) => {
  app.on("issues.opened", async (context) => {

    const issueComment = context.issue({
      body: `Thanks for opening this issue! ${JSON.stringify(context)}`
    });

    await context.octokit.issues.createComment(issueComment);
  });
};
