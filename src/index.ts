import { Probot } from "probot";
import { MD5 } from "crypto-js";
import { Contract, ethers } from "ethers";
import { OpenSourceTokenAbi } from "./contracts/OpenSourceTokenAbi";
import abi = require('../abis/OpenSourceToken.abi.json');
const commands: any = require('probot-commands')

var contractAddress = "0x6562f89B1B5a8E3E1Ee7338e350D6D8aCdb1ED07";

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

var createBodyFromIssuesMapping = async (context: any, payload: any, ownerAddress: string) => {
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
    body += createSvg(issuesMapping.fundingPoolId, payload.html_url, ownerAddress);
    body += "|";
  }

  return body;
}

var createSvg = (fundingPoolId: string, url: string, ownerAddress: string) => {
  var urlSvg = "http://80.180.103.134:3001";
  var urlFunder = `http://80.180.103.134:4200/web3/funding/${ownerAddress}/${fundingPoolId}?ref=${url}`;

  return `[![alt text](${urlSvg}/?owner=${ownerAddress}&fundingPoolId=${fundingPoolId})](${urlFunder})`;
}

export = (app: Probot, { getRouter }: any) => {
  const router = getRouter("/my-app");

  router.use(require("express").static("public"));

  router.get("/hello-world", async (_: any, res: any, _next: any) => {
    var octokit = await app.auth(29273534);
    var ciao = await octokit.request('GET /installation/repositories', {});

    console.log(JSON.stringify(ciao.data.repositories[0]));

    var owner = ciao.data.repositories[0].owner.login;
    var repo = ciao.data.repositories[0].name;
    var base = ciao.data.repositories[0].default_branch;
    var title = "title";
    var body = "body";

    const baseBranchRef = await octokit.git.getRef({
      owner,
      repo,
      ref: `heads/${base}`,
    });

    const newBranchRef = await octokit.git.createRef({
      owner,
      repo,
      ref: `refs/heads/feature/add-config`,
      sha: baseBranchRef.data.object.sha,
    });

    const currentCommit = await octokit.git.getCommit({
      owner,
      repo,
      commit_sha: newBranchRef.data.object.sha,
    });

    const newCommit = await octokit.git.createCommit({
      owner,
      repo,
      message: "Added config",
      tree: currentCommit.data.tree.sha,
      parents: [currentCommit.data.sha],
    });

    await octokit.git.updateRef({
      owner,
      repo,
      ref: `heads/feature/add-config`,
      sha: newCommit.data.sha,
    });

    await octokit.pulls.create({
      owner,
      repo,
      head: "refs/heads/feature/add-config",
      base: `refs/heads/${base}`,
      title,
      body
    });

    res.send("Hello World");
  });

  app.on("issues.opened", async (context) => {
    var fundingPoolId = createFundingPoolId(context.payload.repository.id, context.payload.issue.number);

    var config = await context.config("probot.yaml") as any;

    const issueComment = context.issue({
      body: createSvg(fundingPoolId, context.payload.issue.html_url, config.OwnerAddress)
    });

    await context.octokit.issues.createComment(issueComment);
  });

  app.on("pull_request.opened", async (context) => {
    var config = await context.config("probot.yaml") as any;

    var body = await createBodyFromIssuesMapping(context, context.payload.pull_request, config.OwnerAddress);

    const issueComment = context.issue({
      body: body
    });

    await context.octokit.issues.createComment(issueComment);
  });

  app.on("pull_request.edited", async (context) => {
    if (context.payload.pull_request.merged_at !== null)
      return;

    var config = await context.config("probot.yaml") as any;

    var body = await createBodyFromIssuesMapping(context, context.payload.pull_request, config.OwnerAddress);

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

  // app.on("installation.created", async (context) => {
  //   context.payload.installation.rep
  // });

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

		const provider = new ethers.providers.JsonRpcProvider("https://zksync2-testnet.zksync.dev");

    const signer = new ethers.Wallet("0x3f22cc3e1757c4a69de7e249c99e4217d4a0017157247a863cc7fb61e5a16ec8", provider);

		var contract = new Contract(
      contractAddress,
      abi,
      signer
		) as OpenSourceTokenAbi;

    var issuesMapping = await createIssuesMapping(context, context.payload.issue);

    const labels = command.arguments.split(/, */);

    var config = await context.config("probot.yaml") as any;

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

      issue.balance = await contract.balanceOfFund(config.OwnerAddress, issue.fundingPoolId);

      let changeTx = await contract.approveFundFromBot(config.OwnerAddress, issue.fundingPoolId, labels[0]);
      await changeTx.wait();
    }

    const issueComment = context.issue({
      body: `You have successfully claimed this pull request: ${JSON.stringify(issuesMapping)}`
    });

    await context.octokit.issues.createComment(issueComment);
  });
};
