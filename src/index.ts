import { Probot } from "probot";
import { MD5 } from "crypto-js";

const commands = require('probot-commands')

export = (app: Probot) => {
  app.on("issues.opened", async (context) => {
    var owner = "0xD7C91D12c9Ace617eC2F2B20803dB8E166585baE";

    var fundingPoolId = MD5(JSON.stringify({
      context: 'GitHub',
      repositoryId: context.payload.repository.id,
      issueNumber: context.payload.issue.number
    }));

    var urlSvg = "http://80.180.103.122:3001";
    var urlFunder = `http://80.180.103.122:4200/web3/funding/${owner}/${fundingPoolId}?ref=${context.payload.issue.html_url}`;

    const issueComment = context.issue({
      body: `[![alt text](${urlSvg}/?owner=${owner}&fundingPoolId=${fundingPoolId})](${urlFunder})`
    });

    await context.octokit.issues.createComment(issueComment);
  });

  commands(app, 'label', async (context: any, command: any) => {
    const labels = command.arguments.split(/, */);

    const issueComment = context.issue({
      body: `Addres: ${JSON.stringify(labels)}`
    });

    await context.octokit.issues.createComment(issueComment);
  });
};
