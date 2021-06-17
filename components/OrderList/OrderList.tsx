import styles from './OrderList.module.css';
import Link from 'next/link';
import {useRouter} from 'next/router';
import React, { useEffect, useState, useCallback, useContext } from 'react';
// require("dotenv").config();
const axios = require('axios');
import AdminContext from '../../store/admin-context'
import { authenticatedFetch } from '@shopify/app-bridge-utils';
import gql from 'graphql-tag';
import { Query, useQuery, useLazyQuery, useApolloClient } from 'react-apollo';
import { Card,
    ResourceList,
    Stack,
    TextStyle,
    Thumbnail,
    ButtonGroup,
    Button,
    Tabs,
    TextField,
    Heading,
    Badge,
    IndexTable,
    useIndexResourceState,
} from '@shopify/polaris';
import OrderItem from './OrderItem/OrderItem';
import store from 'store-js';
import { Redirect } from '@shopify/app-bridge/actions';
import { Context, useAppBridge } from '@shopify/app-bridge-react';
import { GET_DOMAIN, GET_ORDERS, GET_PRODUCTS_BY_ID } from '../utils/graphQlQueries'
import fetchApi from '../utils/fetchApi';
import { JobOrder, ShopifyGraphQLOrder, WHOrder } from '../../model/orders.model';
import { RmJob, RmJobWithStep } from '../../model/jobs.model';
import { AdminContextType } from '../../model/context.model';
import { SuccessResponse } from '../../model/responses.model';
import { SelectionType } from '@shopify/polaris/dist/types/latest/src/utilities/index-provider';

// const RM_SERVER_URL = process.env.NEXT_PUBLIC_RM_SERVER_URL;


const OrderList:React.FC =  (props) => {
console.log('flo OrderList');
// const RM_SERVER_URL = 'https://83e781cb2720.ngrok.io';
// const RM_SERVER_URL = process.env.NEXT_PUBLIC_RM_SERVER_URL;
// const client = useApolloClient();
   // const contextType = Context;


   const client = useApolloClient();
   
    // const [domain, setDomain] = useState('flo domain');
    const adminCtx = useContext(AdminContext);
    const router = useRouter();
   
    
    let preventRowSelection = false;
    const [refreshDate, setRefreshDate] = useState<string>('');
    // inform on loading stage: requesting data on shopify or RM
    const [loadingMessage, setLoadingMessage] = useState<string>('');
    // const { loading, error, data, networkStatus } = useQuery(GET_DOMAIN);
    

    useEffect(() => {

      if(adminCtx.domain) {
        console.log('domain already set');
        return;
      }     

      console.log('flo useEffect');
            
      client.query({ query: GET_DOMAIN }).then(domain => {
        console.log('domain', domain.data.shop.primaryDomain.url);
        if(domain.data.shop.primaryDomain.url){
          adminCtx.onDomainChange(domain.data.shop.primaryDomain.url);
          fetchJobOrders();
        }
      })
      .catch(err => console.log('err', err))
    }, [])

    const fetchJobOrders = () => {
      console.log('fetchJobOrders');
      setLoadingMessage('Loading Shopify Orders');
      queryShopifyOrders()
      .then(shopifyOrders => {
        console.log('return queryShopifyOrders', shopifyOrders);
        setLoadingMessage('Loading RouteMagnet data');
        return queryRmOrders(shopifyOrders);
      })     
      .then(data => {
        console.log('return data', data);        
        adminCtx.onJobOrdersChange(data);
        setRefreshDate(new Date().toLocaleString());
        setLoadingMessage('');
      })
      .catch(errMessage => {
        console.log('err2', errMessage);
        adminCtx.onJobOrdersChange([]);
        setLoadingMessage(errMessage);
      })
    }


        const queryShopifyOrders = ():Promise<ShopifyGraphQLOrder[]> => {
            console.log('queryShopifyOrders');
           
          // Graphl Apollo client
          // fetch Shopify orders
          return client.query({ query: GET_ORDERS, fetchPolicy: "no-cache" })
          .then(data => {
            // go through encapsulation data.data.orders.edges
            console.log('ordersdata', data);
            const ordersList = data.data.orders.edges.map(o => o.node) as ShopifyGraphQLOrder[];
            ordersList.forEach(o => {
              o.createdAt = new Date(o.createdAt).toLocaleString()
            })
            return ordersList;
          })
          .catch(err => {
          //  return []
          console.log('queryShopifyOrders error', err);
           throw 'Error fetching Shopify Orders';
           
          })
        }

        const queryRmOrders = (ordersList:ShopifyGraphQLOrder[]):Promise<JobOrder[]> => {
          console.log('queryRmOrders', ordersList);
          // const {orderIDsList, ordersList} = params;

          ordersList = ordersList.map(o => {
            // format id
            return {...o,id:o.id.replace('gid://shopify/Order/','')}
          })

          const orderIDsList = ordersList.map(o => o.id);
          //ordersList ist is string[]
          console.log('queryRmOrders orderIDsList',orderIDsList);
          const obj =  {
            shop:"shop",
            orderIdsList:orderIDsList
        };       

        return fetchApi({
          method:'post',
          body:JSON.stringify(obj),
          url:`${process.env.NEXT_PUBLIC_RM_SERVER_URL}/shopify/orderslist/status`,
        })
          .then((jobs:RmJobWithStep[]) => {
            console.log('RmOrders:',JSON.stringify(jobs));
           // add associated RM job data to each shopify order, we have now all data we need: status on RM, track link...
           // list order item index order is ensure to be same as RM job index order, thus we map by index
            const fullJobOrderList:JobOrder[] = ordersList.map((order,i) => ({...order, job:jobs[i]}));      
         //   setJobOrders(fullJobOrderList.slice());
            return fullJobOrderList.slice();
          })
          .catch(err => {
            console.log('err', err);
             throw 'Error fetching RouteMagnet data';
          //  return [];
            // setLoadingMessage('Error loading Routemagnet data: ', err);
          })      
        }


        const onRefresh = () => {
            console.log('refresh');
            // const res = client.resetStore().then(res => {
            //   console.log('res apollo', res);
              fetchJobOrders();
           // })
           
        }


        const onPushToRM = (whOrder:WHOrder) => {
          console.log('onPushToRM', whOrder);
          console.log('setPreventSel', true);
          preventRowSelection = true;

        
          fetchApi({
            method:'post',
            body:JSON.stringify(whOrder),
            url:`${process.env.NEXT_PUBLIC_RM_SERVER_URL}/shopify/order/add`,
          })
            .then(response => {
              console.log('response job', response);
              // if error, object returned has property error
              if(response.error) {
                console.log(response.error);
                return;
              }
              const job = response as RmJob;
              adminCtx.onJobOrderPush({...job});
            })
        }

        const onFulfillOneOrder = (o:JobOrder) => {
          preventRowSelection = true;
          const orderId = o.id.replace('gid://shopify/Order/','')
          axios.post('/api/fulfillment',{action:'test',orderId})
          .then(response => {
            const result = response?.data as SuccessResponse;

            console.log('response webhooks api', result);
            console.log('response fulfillment api', response);
            if(result.success) {
              onRefresh();
            }
                      
          })
          .catch(err => {
            console.log('err fulfillment', err);
          })
        }

        const {
          selectedResources,
          allResourcesSelected,
          handleSelectionChange,
          // @ts-ignore
        } = useIndexResourceState(adminCtx.jobOrders);

       const onSelectionChangeHandler = (selectionType: SelectionType, toggleType: boolean, selectedOrderId:any)  => {
          console.log('onSelectionChange',selectionType, toggleType,selectedOrderId);
          console.log('preventRowSelection', preventRowSelection);
          if(preventRowSelection) {
            console.log('in preventRowSelection condition');          
            preventRowSelection = false;
            return;
          }
          if(!selectedOrderId) return;
          router.push(`/order-details/${selectedOrderId}`);
       }

        const rowMarkup = (list:JobOrder[]) => {
          console.log('rowMarkup');
          return list.map((o,i)=>{
          return <OrderItem
            index={i}
             key={o.id}
              id={o.id}
              order={o}
              onPushOrder={onPushToRM}
              onFulfillOrder={onFulfillOneOrder}
              isManualMode={adminCtx.mode.manual}
              domain={adminCtx.domain}
              selectedResources={selectedResources}
          />})
        }
      const IndexTableBlock = () => {
        console.log('IndexTableBlock');
        return <IndexTable
        resourceName={{ singular: 'Order', plural: 'Orders' }}
        itemCount={adminCtx.jobOrders.length}
        selectedItemsCount={
          allResourcesSelected ? 'All' : selectedResources.length
        }
        selectable = {false}
        loading = {loadingMessage ? true : false}
        onSelectionChange={onSelectionChangeHandler}
        headings={[
          {title: 'Name'},
          {title: 'Created'},
          {title: 'Customer'},
          {title: 'RM Link'},
          {title: 'Fulfill'},
          {title: 'RM Status'},
        ]}
      >
        {rowMarkup(adminCtx.jobOrders.slice())}
      </IndexTable>
      }
  
      return (
        
        <React.Fragment>
              <Card>
                  <div  className={styles.refreshMessage}>
                   <Button onClick={() => onRefresh()}>
                            Refresh
                    </Button>
                    </div>
                    <div  className={styles.refreshMessage}>Last refresh at {refreshDate}</div>
                    { 
                      loadingMessage && <div  className={styles.refreshMessage}>{loadingMessage}</div>
                    }
                 <p>Shop:{adminCtx.domain}</p>
                 {/* <ResourceList>
                    <Stack>
                        <Stack.Item fill>
                            Order Id
                        </Stack.Item>
                    </Stack>
                    <Stack>
                        <Stack.Item fill>
                            Link
                        </Stack.Item>
                    </Stack>
                    <Stack>
                        <Stack.Item fill>
                            RouteMagnet Status
                        </Stack.Item>
                    </Stack>
                 </ResourceList> */}
              { adminCtx.jobOrders && adminCtx.jobOrders.length > 0 &&
              IndexTableBlock()
              //  <ResourceList
              //   showHeader={true}
              //   resourceName={{ singular: 'Order', plural: 'Orders' }}
              //   items={adminCtx.jobOrders}
              //   renderItem={(item,itemId, index) => {
              //     const {id, name} = item;

               
              //     return (
              //       <OrderItem
              //         key={id}
              //         id={id}
              //         order={item}
              //         onPushOrder={onPushToRM}
              //         onFulfillOrder={onFulfillOneOrder}
              //         isManualMode={adminCtx.mode.manual}
              //         domain={adminCtx.domain}             
              //       />
              //      );
              //    }}
              //  />
               }
               </Card>            

</React.Fragment>
        )
 
    }
  
  
  export default OrderList;