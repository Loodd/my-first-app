import { Probot } from "probot";
import { MD5 } from "crypto-js";
import { Contract, ethers } from "ethers";
import { OpenSourceTokenAbi } from "./contracts/OpenSourceTokenAbi";
import abi = require('../abis/OpenSourceToken.abi.json');
const commands: any = require('probot-commands')

var createFundingPoolId = (repositoryId: number, issueNumber: number) => {
  return MD5(JSON.stringify({
    context: 'GitHub',
    repositoryId: repositoryId,
    issueNumber: issueNumber
  })).toString();
}

var createIssuesMapping = async (context: any, payload: any) => {
  var query = `{
    repository(name: "${context.payload.repository.name}", owner: "${context.payload.repository.owner.login}") {
      pullRequest(number: ${payload.number}) {
        closingIssuesReferences(first: 100) {
          nodes {
            number
          }
        }
      }
    }
  }`;

  var data = await context.octokit.graphql(query);
  
  var issuesMapping: any = [];

  for (var node of data.repository.pullRequest.closingIssuesReferences.nodes) {
    var fundingPoolId = createFundingPoolId(context.payload.repository.id, node.number);

    issuesMapping.push({
      nodeNumber: node.number,
      fundingPoolId: fundingPoolId
    });
  }

  return issuesMapping;
}

var createBodyFromIssuesMapping = async (context: any, payload: any) => {
  var issuesMapping = await createIssuesMapping(context, payload);

  var body = `[//]: <> (%RECAP_COMMENT%)`;
  body += "\n";
  body += "\n";
  body += "| Issue number | SVG |";
  body += "\n";
  body += "| ------------- | ------------- |";

  for (var issuesMapping of issuesMapping) {
    body += "\n";
    body += "|";
    body += `#${issuesMapping.nodeNumber}`;
    body += "|";
    body += createSvg(issuesMapping.fundingPoolId, payload.html_url);
    body += "|";
  }

  return body;
}

var createSvg = (fundingPoolId: string, url: string) => {
  var owner = "0xD7C91D12c9Ace617eC2F2B20803dB8E166585baE";

  var urlSvg = "http://80.180.103.134:3001";
  var urlFunder = `http://80.180.103.134:4200/web3/funding/${owner}/${fundingPoolId}?ref=${url}`;

  return `[![alt text](${urlSvg}/?owner=${owner}&fundingPoolId=${fundingPoolId})](${urlFunder})`;
}

export = (app: Probot) => {
  app.on("issues.opened", async (context) => {

    var fundingPoolId = createFundingPoolId(context.payload.repository.id, context.payload.issue.number);

    const issueComment = context.issue({
      body: createSvg(fundingPoolId, context.payload.issue.html_url)
    });

    await context.octokit.issues.createComment(issueComment);
  });

  app.on("pull_request.opened", async (context) => {
    var body = await createBodyFromIssuesMapping(context, context.payload.pull_request);

    const issueComment = context.issue({
      body: body
    });

    await context.octokit.issues.createComment(issueComment);
  });

  app.on("pull_request.edited", async (context) => {
    var body = await createBodyFromIssuesMapping(context, context.payload.pull_request);

    const app = await context.octokit.apps.getAuthenticated();

    var comments = await context.octokit.issues.listComments({
      issue_number: context.payload.number,
      owner: context.payload.repository.owner.login,
      repo: context.payload.repository.name
    });

    var c = comments.data
      .filter(c => c.user?.login == app.data.slug + '[bot]')
      .filter(c => (c.body?.indexOf("%RECAP_COMMENT%") || -1) > -1)[0];
    
    await context.octokit.issues.updateComment({
      comment_id: c.id,
      body: body,
      repo: context.payload.repository.name,
      owner: context.payload.repository.owner.login
    });
  });

  app.on("pull_request.closed", async (context) => {
    if (!context.payload.pull_request.merged)
      return;

    await context.octokit.issues.createComment(context.issue({
      body: `@${context.payload.pull_request.user.login}\nThe pull request was approved, you can now claim this pull request with the command _/claim <\\<your address\\>>_`
    }));
  });

  commands(app, 'claim', async (context: any, command: any) => {
    var owner = "0xD7C91D12c9Ace617eC2F2B20803dB8E166585baE";

    if (context.payload.comment.user.id !== context.payload.issue.user.id) {
      await context.octokit.issues.createComment(context.issue({
        body: `You can't claim because you are not the owner of this pull request.`
      }));
      
      return;
    }

    if (context.payload.issue.pull_request.merged_at === null) {
      await context.octokit.issues.createComment(context.issue({
        body: `You can't claim because the pull request must be merged first.`
      }));

      return;
    }

		const provider = new ethers.providers.JsonRpcProvider("https://zksync2-testnet.zksync.dev");

    const signer = new ethers.Wallet("0x6d6352f3144cc7a9ba24d6f7b603baf05cc556d5bb2de494c39ed473db50f074", provider);

		var contract = new Contract(
      "0x745c8671B6A6bDE6FB74Ee04D93bBB643E6cd4B5",
      abi,
      signer
		) as OpenSourceTokenAbi;

    var issuesMapping = await createIssuesMapping(context, context.payload.issue);

    const labels = command.arguments.split(/, */);

    for (var issue of issuesMapping) {
      var q = `{
        repository(name: "${context.payload.repository.name}", owner: "${context.payload.repository.owner.login}") {
          issue(number: ${issue.nodeNumber}) {
            timelineItems(itemTypes: CLOSED_EVENT, last: 1) {
              nodes {
                ... on ClosedEvent {
                  closer {
                    ... on PullRequest {
                      number
                    }
                  }
                }
              }
            }
          }
        }
      }`;
  
      var d = await context.octokit.graphql(q);
  
      if (d.repository.issue.timelineItems.nodes[0].closer?.number !== context.payload.issue.number)
        continue;

      issue.balance = await contract.balanceOfFund(owner, issue.fundingPoolId);

      let changeTx = await contract.approveFund(issue.fundingPoolId, labels[0]);
      await changeTx.wait();
    }

    const issueComment = context.issue({
      body: `You have successfully claimed this pull request: ${JSON.stringify(issuesMapping)}`
    });

    await context.octokit.issues.createComment(issueComment);
  });
};
