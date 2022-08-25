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

export = (app: Probot) => {
  app.on("issues.opened", async (context) => {
    var owner = "0xD7C91D12c9Ace617eC2F2B20803dB8E166585baE";

    var fundingPoolId = createFundingPoolId(context.payload.repository.id, context.payload.issue.number);

    var urlSvg = "http://80.180.105.139:3001";
    var urlFunder = `http://80.180.105.139:4200/web3/funding/${owner}/${fundingPoolId}?ref=${context.payload.issue.html_url}`;

    const issueComment = context.issue({
      body: `[![alt text](${urlSvg}/?owner=${owner}&fundingPoolId=${fundingPoolId})](${urlFunder})`
    });

    await context.octokit.issues.createComment(issueComment);
  });

  commands(app, 'claim', async (context: any, command: any) => {
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

    var owner = "0xD7C91D12c9Ace617eC2F2B20803dB8E166585baE";

		const provider = new ethers.providers.JsonRpcProvider("https://zksync2-testnet.zksync.dev");

    const signer = new ethers.Wallet("0x6d6352f3144cc7a9ba24d6f7b603baf05cc556d5bb2de494c39ed473db50f074", provider);

		var contract = new Contract(
      "0x745c8671B6A6bDE6FB74Ee04D93bBB643E6cd4B5",
      abi,
      signer
		) as OpenSourceTokenAbi;

    var query = `{
      repository(name: "${context.payload.repository.name}", owner: "${context.payload.organization.login}") {
        pullRequest(number: ${context.payload.issue.number}) {
          closingIssuesReferences(first: 100) {
            nodes {
              number
            }
          }
        }
      }
    }`;

    const labels = command.arguments.split(/, */);

    var issuesMapping: any = {};

    var data = await context.octokit.graphql(query);
    
    for (var node of data.repository.pullRequest.closingIssuesReferences.nodes) {
      var q = `{
        repository(name: "${context.payload.repository.name}", owner: "${context.payload.organization.login}") {
          issue(number: ${node.number}) {
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

      if (d.repository.issue.timelineItems.nodes[0].closer.number !== context.payload.issue.number)
        return;

      var fundingPoolId = createFundingPoolId(context.payload.repository.id, node.number);

      var balance = await contract.balanceOfFund(owner, fundingPoolId);

      issuesMapping[node.number] = balance;

      let changeTx = await contract.approveFund(fundingPoolId, labels[0]);

      await changeTx.wait();
    }

    const issueComment = context.issue({
      body: `You have successfully claimed this pull request: ${JSON.stringify(issuesMapping)}`
    });

    await context.octokit.issues.createComment(issueComment);
  });
};
