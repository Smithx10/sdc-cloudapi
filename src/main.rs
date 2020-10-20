use std::any::Any;
use std::collections::BTreeMap;
use std::ops::Bound;
use std::sync::Arc;

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_with::skip_serializing_none;

use rust_sdc_clients::vmapi;
use rust_sdc_clients::vmapi::Vm;

use http::StatusCode;
use hyper::Body;
use hyper::Response;
use uuid::Uuid;

use dropshot::endpoint;
use dropshot::ApiDescription;
use dropshot::ConfigDropshot;
use dropshot::ConfigLogging;
use dropshot::ConfigLoggingLevel;
use dropshot::HttpError;
use dropshot::HttpResponseOk;
use dropshot::HttpServer;
use dropshot::PaginationParams;
use dropshot::Path;
use dropshot::Query;
use dropshot::RequestContext;
use dropshot::ResultsPage;
use dropshot::WhichPage;

struct Context {
    // TODO: share a database connection here.
}

impl Context {
    pub async fn new() -> Arc<Context> {
        let api_context = Context {};

        Arc::new(api_context)
    }

    pub fn _from_rqctx(rqctx: &Arc<RequestContext>) -> Arc<Context> {
        let ctx: Arc<dyn Any + Send + Sync + 'static> = Arc::clone(&rqctx.server.private);
        ctx.downcast::<Context>()
            .expect("wrong type for private data")
    }
}

#[tokio::main]
async fn main() -> Result<(), String> {
    let config_dropshot = ConfigDropshot {
        bind_address: "0.0.0.0:8888".parse().unwrap(),
    };

    let config_logging = ConfigLogging::StderrTerminal {
        level: ConfigLoggingLevel::Info,
    };
    let log = config_logging
        .to_logger("cio-server")
        .map_err(|error| format!("failed to create logger: {}", error))
        .unwrap();

    let mut api = ApiDescription::new();
    api.register(cloudapi_machines_get_machines).unwrap();
    //api.register(cloudapi_images_get_images).unwrap();

    let api_context = Context::new().await;

    let mut server = HttpServer::new(&config_dropshot, api, api_context, &log)
        .map_err(|error| format!("failed to create server: {}", error))?;
    let server_task = server.run();

    server.wait_for_shutdown(server_task).await
}

#[derive(Deserialize, JsonSchema, Debug)]
struct PathParams {
    account: String,
}

#[skip_serializing_none]
#[derive(Serialize, Deserialize, JsonSchema, Debug)]
struct ListVmsParams {
    #[serde(rename = "type")]
    type_name: Option<String>,
    brand: Option<String>,
    name: Option<String>,
    image: Option<String>,
    state: Option<String>,
    memory: Option<i32>,
    tombstone: Option<bool>,
    limit: Option<i32>,
    offset: Option<i32>,
    tag_name: Option<String>,
    docker: Option<bool>,
    credentials: Option<bool>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct EmptyScanParams {}

/** List Machines. */
#[endpoint {
    method = GET,
    path = "/{account}/machines",
}]
async fn cloudapi_machines_get_machines(
    rqctx: Arc<RequestContext>,
    query_params: Query<ListVmsParams>,
    //pag_params: Query<PaginationParams<EmptyScanParams, VmPage>>,
    path_params: Path<PathParams>,
    //body_params: Body<BodyParams>,
) -> Result<Response<Body>, HttpError> {
    let q = query_params.into_inner();
    //let pag_params = pag_params.into_inner();
    let p = path_params.into_inner();

    println!("{:?}", q);
    println!("{:?}", p);

    let vclient = vmapi::VmapiClient::new(
        "http://vmapi.coal.smithp4ntz.io",
        "http://workflow.coal.smithp4ntz.io",
    );

    let vms = vclient.list_vms(vmapi::ListVmInput::new().build()).await;

    let machines: Vec<vmapi::Machine> = vms.unwrap().iter().map(|x| x.to_machine()).collect();
    //println!("{:?}", machines);

    let resource_count = machines.iter().len();

    let body = serde_json::to_vec(&machines).unwrap();
    //let body = serde_json::to_vec(

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header("x-resource-count", resource_count)
        .body(body.into())
        .unwrap())
}

/** List Images. */
#[endpoint {
    method = GET,
    path = "/{account}/images",
}]
async fn cloudapi_images_get_images(
    rqctx: Arc<RequestContext>,
    //query_params: Query<QueryParams>,
    pag_params: Query<PaginationParams<EmptyScanParams, ListVmsParams>>,
    path_params: Path<PathParams>,
    //body_params: Body<BodyParams>,
) -> Result<HttpResponseOk<String>, HttpError> {
    let image = "image";
    println!("rawr");

    Ok(HttpResponseOk(image.to_string()))
}
